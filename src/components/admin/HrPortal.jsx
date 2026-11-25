import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import AnswerReviewsTab from './AnswerReviewsTab';
import { CheckIcon, AlertTriangleIcon } from './AdminUI';

/**
 * Portal RRHH (2026-10-29). Se abre desde el modal de PIN del kiosco con el
 * PIN de RRHH: el token llega en el fragmento (#t=…), se guarda solo en
 * memoria y se borra de la URL. El servidor lo exige en cada llamada.
 */
const readTokenFromHash = () => {
    const m = window.location.hash.match(/[#&]t=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
};

const HrPortal = ({ onClose }) => {
    const [token, setToken] = useState(readTokenFromHash);

    useEffect(() => {
        if (window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, []);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleUnauthorized = useCallback(() => setToken(null), []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-0 z-50 bg-admin-bg flex flex-col p-6 overflow-hidden text-admin-ink font-admin-sans"
        >
            <div className="flex justify-between items-center mb-6 border-b border-admin-border pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-admin-accent text-white flex items-center justify-center flex-shrink-0">
                        <CheckIcon size={18} />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-admin-ink leading-tight">Portal RRHH</h1>
                        <p className="text-xs text-admin-muted">Revisión y aprobación de respuestas de RITIA</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-admin-card hover:bg-admin-bg border border-admin-border rounded-lg text-admin-ink text-sm transition-colors"
                >
                    Cerrar [ESC]
                </button>
            </div>

            <div className="flex-grow overflow-hidden flex flex-col">
                {token ? (
                    <AnswerReviewsTab token={token} onUnauthorized={handleUnauthorized} />
                ) : (
                    <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
                        <div className="w-11 h-11 rounded-full bg-admin-warning-soft text-admin-warning flex items-center justify-center">
                            <AlertTriangleIcon size={20} />
                        </div>
                        <h2 className="text-sm font-semibold text-admin-ink">Sesión expirada o no iniciada</h2>
                        <p className="text-xs text-admin-muted max-w-sm">
                            Vuelve a ingresar el PIN de RRHH desde el kiosco (5 toques en el logo) para abrir el portal.
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default HrPortal;
