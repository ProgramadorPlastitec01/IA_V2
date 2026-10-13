import { motion, AnimatePresence } from 'framer-motion';
import { HandsHelpingIcon, TimesIcon, CommentDotsIcon } from './shared.jsx';

/**
 * AboutRitaModal — "¿Qué es RITA?" (2026-10-13).
 * Pequeña sección explicativa sobre el nombre y el funcionamiento del
 * asistente, abierta desde un enlace en HomeView. Mismo patrón visual que
 * los demás modales del kiosco (PIN admin, aviso de inactividad).
 */
const AboutRitaModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                    className="bg-kiosk-card border border-kiosk-border rounded-3xl p-8 max-w-xl w-full shadow-2xl flex flex-col max-h-[85vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-brand"><HandsHelpingIcon size={24} /></div>
                            <div>
                                <h2 className="text-xl text-kiosk-text font-bold tracking-tight">¿Qué es RITA?</h2>
                                <p className="text-xs text-kiosk-muted uppercase tracking-widest mt-1">Tu asistente de RRHH</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border rounded-full text-kiosk-muted hover:text-kiosk-text transition-all"
                        >
                            <TimesIcon size={16} />
                        </button>
                    </div>

                    <div className="overflow-y-auto custom-scrollbar pr-1 space-y-4 text-sm md:text-[15px] text-kiosk-text leading-relaxed">
                        <p>
                            RITA es tu asistente virtual de Recursos Humanos en Plastitec. Su nombre viene del
                            <strong className="font-semibold"> Reglamento Interno de Trabajo (R.I.T.)</strong>, que es
                            justamente la base de la información que maneja, combinado con una "A" de
                            <strong className="font-semibold"> Asistente</strong>, porque la idea es que sea como
                            preguntarle a alguien del equipo de RRHH.
                        </p>
                        <p>
                            Puedes hablarle o escribirle tus dudas sobre permisos, vacaciones, horarios, políticas
                            internas y demás temas del reglamento, y RITA te responde al instante
                            <strong className="font-semibold"> consultando siempre los documentos oficiales vigentes</strong>,
                            no una respuesta guardada de antes. Así, si RRHH actualiza una política, basta con
                            cargar el documento actualizado para que RITA la tenga en cuenta en tu próxima consulta.
                        </p>
                        <p className="bg-kiosk-panel border border-kiosk-border rounded-xl p-4 text-kiosk-muted flex items-start gap-2">
                            <span className="text-brand shrink-0 mt-0.5"><CommentDotsIcon size={16} /></span>
                            <span>Si en algún momento tu pregunta es muy puntual o sensible, RITA te dirá que es mejor
                            hablarlo directamente con el equipo de RRHH.</span>
                        </p>
                    </div>

                    <div className="mt-6 pt-6 border-t border-kiosk-border text-center flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-brand hover:bg-brand-hover transition-colors rounded-full text-white font-bold text-sm"
                        >
                            Entendido
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default AboutRitaModal;
