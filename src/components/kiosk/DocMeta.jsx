// "2025-02-19" → "19/02/2025"
const formatDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/**
 * Código, versión y fecha del documento (control documental). El RIT no tiene
 * código: se muestra desde cuándo está vigente.
 */
const DocMeta = ({ doc, className = '' }) => {
    const fecha = formatDate(doc.fecha);
    const vigente = formatDate(doc.vigenteDesde);
    const items = [
        doc.codigo && ['Código', doc.codigo],
        doc.version && ['Versión', doc.version],
        fecha && ['Fecha', fecha],
        vigente && ['Vigente desde', vigente],
    ].filter(Boolean);
    if (items.length === 0) return null;
    return (
        <dl className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${className}`}>
            {items.map(([label, value]) => (
                <div key={label} className="flex gap-1">
                    <dt className="text-kiosk-muted">{label}:</dt>
                    <dd className="font-semibold text-kiosk-text">{value}</dd>
                </div>
            ))}
        </dl>
    );
};

export default DocMeta;
