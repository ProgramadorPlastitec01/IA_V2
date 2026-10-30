import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../utils/apiConfig';

/**
 * Lista en vivo de documentos del corpus desde /api/documents (nombre, código,
 * versión, fecha). Compartido por DocumentsView y DocumentsModal.
 * Si el backend es anterior y solo envía `documents` (nombres), se degrada a
 * tarjetas sin código/versión.
 */
export const useDocuments = () => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    // Ref (no state) para "ya se hizo el fetch": con StrictMode, React monta →
    // desmonta → vuelve a montar el efecto en desarrollo. Si el fetch arranca
    // de forma síncrona en el primer montaje, su cleanup marca `cancelled=true`
    // ANTES de que llegue la respuesta y el segundo montaje nunca reintenta
    // (la vista se queda en "Cargando..." para siempre). Diferir el arranque a
    // un microtask deja que mount→cleanup→mount ocurran antes de decidir, así
    // solo el montaje que sobrevive ejecuta el fetch.
    const hasFetchedRef = useRef(false);

    useEffect(() => {
        if (hasFetchedRef.current) return;
        let cancelled = false;
        Promise.resolve().then(() => {
            if (cancelled) return;
            hasFetchedRef.current = true;
            fetch(`${API_BASE_URL}/api/documents`)
                .then(r => r.json())
                .then(data => {
                    if (cancelled) return;
                    setDocuments(data.details || (data.documents || []).map(name => ({ name })));
                })
                .catch(() => { if (!cancelled) setErrored(true); })
                .finally(() => { if (!cancelled) setLoading(false); });
        });
        return () => { cancelled = true; };
    }, []);

    return { documents, loading, errored };
};
