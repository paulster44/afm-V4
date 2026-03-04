import express from 'express';
import { Resend } from 'resend';
import { requireAuth } from '../middleware/auth';
import Busboy from 'busboy';

const router = express.Router();

// Initialize Resend with the API key from environment variables
if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is required');
}
const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/', requireAuth, (req, res) => {
    // In Firebase Cloud Functions, the raw body is sometimes already parsed,
    // but for multipart/form-data we generally need to use busboy.

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } });
    const fields: Record<string, any> = {};
    let fileBuffer: Buffer | null = null;
    let fileName = 'contract.pdf';

    busboy.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, file, info) => {
        const { filename } = info;
        if (fieldname === 'pdf') {
            fileName = filename || 'contract.pdf';
            const chunks: Buffer[] = [];
            file.on('data', (data) => {
                chunks.push(data);
            });
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        } else {
            // Resume uploading immediately so we don't stall the stream
            file.resume();
        }
    });

    busboy.on('finish', async () => {
        try {
            const { to, subject, message } = fields;

            if (!to) {
                return res.status(400).json({ error: 'Recipient email is required' });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(to)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            if (!fileBuffer) {
                return res.status(400).json({ error: 'PDF file is required' });
            }

            const fromAddress = process.env.EMAIL_SENDER || 'contracts@fakturflow.phonikamedia.com';

            const escapeHtml = (str: string) =>
                str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const htmlMessage = message
                ? `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`
                : `<p>Please find the attached Smart Contract PDF.</p>`;

            // Sanitize subject: strip control chars and limit length
            const sanitizedSubject = (subject || 'AFM Smart Contract PDF')
                .replace(/[\x00-\x1F\x7F]/g, '')
                .slice(0, 200);

            const { data, error } = await resend.emails.send({
                from: `AFM Smart Contracts <${fromAddress}>`,
                to: [to],
                subject: sanitizedSubject,
                html: htmlMessage,
                attachments: [
                    {
                        filename: fileName,
                        content: fileBuffer,
                    },
                ],
            });

            if (error) {
                console.error('Error sending email via Resend:', error);
                return res.status(500).json({ error: 'Failed to send email. Please check configuration.' });
            }

            return res.status(200).json({ success: true, message: 'Email sent successfully', id: data?.id });

        } catch (error) {
            console.error('Unexpected error in email route:', error);
            return res.status(500).json({ error: 'Internal server error while sending email' });
        }
    });

    busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        return res.status(500).json({ error: 'Error processing upload' });
    });

    // Depending on how Express/Connect is passing the body in Cloud Functions:
    // @ts-ignore - rawBody is added by Firebase
    if (req.rawBody) {
        // @ts-ignore
        busboy.end(req.rawBody);
    } else {
        req.pipe(busboy);
    }
});

export default router;
