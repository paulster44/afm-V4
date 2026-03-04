// FIX: Implement PDF generation functionality. Note: This component requires `jspdf` and `jspdf-autotable` to be installed.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Config, ContractType, FormData, CalculationResult, Person } from '../types';

// A helper to format currency, consistent with the wizard display
const formatCurrency = (value: number, symbol: string) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return `${symbol}0.00`;
    }
    const isNegative = value < 0;
    const fixedValue = Math.abs(value).toFixed(2);
    return isNegative ? `-${symbol}${fixedValue}` : `${symbol}${fixedValue}`;
};

export const generatePdf = (
    config: Config,
    contractType: ContractType,
    formData: FormData,
    calculationResults: CalculationResult[],
    personnel: Person[]
) => {
    const doc = new jsPDF();
    const currency = contractType.currency || config.currency;
    const pageContentMargin = 14;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let lastY = 0;

    // The signature block requires a certain amount of vertical space.
    // We'll use this to ensure tables and other content leave enough room.
    const SIGNATURE_BLOCK_HEIGHT = 60;

    // --- Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(contractType.name, pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated for ${config.localName}`, pageWidth / 2, 28, { align: 'center' });
    lastY = 35;

    // --- Contract Details ---
    const formFields = contractType.fields;
    const fieldData = formFields
        .map(field => {
            let value = formData[field.id];
            if (field.dataSource === 'wageScales' && contractType.wageScales) {
                const scale = contractType.wageScales.find(s => s.id === value);
                value = scale ? scale.name : value;
            }
            if (field.type === 'currency' && typeof value === 'number') {
                value = formatCurrency(value, currency.symbol);
            }
            return [field.label, String(value || '')];
        })
        .filter(row => row[1] && row[1] !== '0');

    if (fieldData.length > 0) {
        autoTable(doc, {
            startY: lastY,
            head: [['Engagement Details', '']],
            body: fieldData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], fontSize: 14 },
            columnStyles: { 0: { fontStyle: 'bold' } },
        });
        lastY = (doc as any).lastAutoTable.finalY;
    }

    // --- Personnel Details ---
    if (personnel.length > 0) {
        const personnelData = personnel.map(p => [
            p.name,
            p.address,
            '' // Leave SSN/SIN blank for manual entry
        ]);
        autoTable(doc, {
            startY: lastY + 10,
            head: [['Personnel', 'Address', 'SSN / SIN']],
            body: personnelData,
            theme: 'striped',
            headStyles: { fillColor: [80, 80, 80], fontSize: 14 },
            columnStyles: { 0: { fontStyle: 'bold' } },
        });
        lastY = (doc as any).lastAutoTable.finalY;
    }


    // --- Financial Summary ---
    const summaryData = calculationResults.map(item => {
        return [item.label, formatCurrency(item.value, currency.symbol)];
    });
    const hasFinancials = summaryData.length > 0;
    if (hasFinancials) {
        autoTable(doc, {
            startY: lastY + 10,
            head: [['Calculation Summary', 'Amount']],
            body: summaryData,
            theme: 'grid',
            headStyles: { fillColor: [39, 174, 96], fontSize: 14 },
            didParseCell: (data) => {
                const totalLabels = ['Total', 'Balance', 'Due'];
                if (data.section === 'body' && totalLabels.some(label => String(data.cell.raw).includes(label))) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = '#f0f0f0';
                }
            },
        });
        lastY = (doc as any).lastAutoTable.finalY;
    }

    // --- Legal Text ---
    const legalText = contractType.legalText;

    if (legalText) {
        const clausesToRender: { text: string; isPreamble: boolean; }[] = [];
        const leader = personnel.find(p => p.role === 'leader');
        const leaderName = leader ? leader.name : '';

        // Prepare legal content, starting with the preamble and replacing placeholders
        if (legalText.preamble) {
            const today = new Date().toLocaleDateString();
            let preambleText = legalText.preamble
                .replace('{TODAY}', today)
                .replace('{numberOfMusicians}', String(personnel.length || 1))
                .replace('{leaderName}', leaderName);
            clausesToRender.push({ text: preambleText, isPreamble: true });
        }

        // Add other clauses, checking for any conditional logic
        Object.entries(legalText).forEach(([key, value]) => {
            if (key === 'preamble' || !value) return;

            let shouldRender = true;
            if (key === 'clause_arbitrationL1') {
                shouldRender = formData.disputeResolution === 'Binding Arbitration (L-1)';
            } else if (key === 'clause_courtActionL2') {
                shouldRender = formData.disputeResolution === 'Direct Court Action (L-2)';
            }

            if (shouldRender) {
                clausesToRender.push({ text: value, isPreamble: false });
            }
        });

        // Calculate total height of the legal block to prevent orphans
        let totalTextHeight = 0;
        clausesToRender.forEach(clause => {
            const fontStyle = clause.isPreamble ? 'italic' : 'normal';
            const fontSize = clause.isPreamble ? 10 : 9;
            doc.setFont('helvetica', fontStyle);
            doc.setFontSize(fontSize);
            const splitText = doc.splitTextToSize(clause.text, pageWidth - pageContentMargin * 2);
            totalTextHeight += doc.getTextDimensions(splitText).h + 8; // Clause height + margin
        });

        // Add a new page if the entire legal block + signatures won't fit
        if (lastY + 15 + totalTextHeight + SIGNATURE_BLOCK_HEIGHT > pageHeight - pageContentMargin) {
            doc.addPage();
            lastY = pageContentMargin;
        }

        lastY += 15; // Top margin for legal section

        // Render the legal clauses
        clausesToRender.forEach(clause => {
            const splitText = doc.splitTextToSize(clause.text, pageWidth - pageContentMargin * 2);

            if (clause.isPreamble) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'italic');
            } else {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
            }

            doc.text(splitText, pageContentMargin, lastY);
            lastY += doc.getTextDimensions(splitText).h + 8; // Add margin after each clause
        });
    }

    // --- Signatures ---
    // The logic to add a new page here has been removed.
    // The responsibility for ensuring space is now on the content blocks above
    // (via `marginBottom` in autoTable or the manual check for legalText).
    lastY += 20; // Add some space before the signature block

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const signatureBlockWidth = 80;
    const signatureY = lastY;

    doc.line(pageContentMargin, signatureY, pageContentMargin + signatureBlockWidth, signatureY);
    doc.text("Signature of Purchaser", pageContentMargin, signatureY + 5);

    const musicianSignatureX = pageWidth - pageContentMargin - signatureBlockWidth;
    doc.line(musicianSignatureX, signatureY, musicianSignatureX + signatureBlockWidth, signatureY);
    doc.text("Signature of Musician/Leader", musicianSignatureX, signatureY + 5);

    // --- Generate Reference Number (used in footer and filename) ---
    const date = formData.engagementDate || formData.sessionDate || new Date().toISOString().split('T')[0];
    const refDate = String(date).replace(/-/g, '');
    const refTime = new Date().getTime().toString().slice(-6);
    const refId = `${refDate}-${refTime}`;
    const referenceNumber = `Ref: ${refId}`;

    // --- Footer with Page Numbers and Ref ---
    const totalPages = (doc as any).internal.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(150);
        const footerText = `${referenceNumber} | Page ${i} of ${totalPages}`;
        doc.text(
            footerText,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }

    // --- Save PDF ---
    const fileName = `Ref_${refId}.pdf`;

    return {
        blob: doc.output('blob'),
        fileName: fileName.toLowerCase()
    };
};