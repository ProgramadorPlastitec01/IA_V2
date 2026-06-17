import { motion, AnimatePresence } from 'framer-motion';

const HelpGuide = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="bg-bg-panel border border-line rounded-2xl p-8 max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh]"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'var(--color-cat-amber-fill)' }}>
                                💡
                            </div>
                            <div>
                                <h2 className="text-xl text-ink font-medium tracking-tight">Convenciones de Uso</h2>
                                <p className="text-xs text-muted uppercase tracking-widest mt-1">¿Cómo formular tus preguntas?</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center bg-surface hover:bg-line border border-line rounded-full text-muted hover:text-ink transition-all text-xl"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Content Scrollable */}
                    <div className="overflow-y-auto custom-scrollbar pr-2 space-y-8 pb-4">

                        {/* Instrucciones */}
                        <section className="bg-surface border border-line rounded-3xl p-6">
                            <h3 className="text-brand text-sm font-medium uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span>🎯</span> Instrucciones Clave
                            </h3>
                            <p className="text-ink text-lg font-normal leading-relaxed">
                                Para obtener la mejor respuesta, formula preguntas <strong className="font-medium">claras y específicas</strong>.
                                El asistente entiende lenguaje natural, pero las consultas cortas sin contexto pueden confundirlo.
                                <span className="block mt-2 text-brand">Entre más contexto des a tu inquietud, más precisa será la respuesta.</span>
                            </p>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Bien formuladas */}
                            <section className="rounded-3xl p-6 border" style={{ background: 'var(--color-cat-teal-fill)', borderColor: 'var(--color-cat-teal)' }}>
                                <h3 className="text-base font-medium flex items-center gap-2 mb-4" style={{ color: 'var(--color-cat-teal)' }}>
                                    <span className="text-xl">✅</span> Ejemplos Correctos
                                </h3>
                                <ul className="space-y-4">
                                    {[
                                        '"¿Cuántos días de vacaciones tengo al cumplir un año?"',
                                        '"¿Cuál es el horario laboral de lunes a viernes?"',
                                        '"¿Qué pasa si llego tarde sin justificación?"',
                                    ].map((t, i) => (
                                        <li key={i} className="flex items-start gap-3 text-ink font-normal">
                                            <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--color-cat-teal)' }}></div>
                                            <span>{t}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* Mal formuladas */}
                            <section className="rounded-3xl p-6 border" style={{ background: 'var(--color-cat-coral-fill)', borderColor: 'var(--color-cat-coral)' }}>
                                <h3 className="text-base font-medium flex items-center gap-2 mb-4" style={{ color: 'var(--color-cat-coral)' }}>
                                    <span className="text-xl">❌</span> Ejemplos Incorrectos
                                </h3>
                                <ul className="space-y-4">
                                    {['"vacaciones"', '"horario"', '"tarde"'].map((t, i) => (
                                        <li key={i} className="flex items-start gap-3 text-muted font-normal line-through" style={{ textDecorationColor: 'var(--color-cat-coral)' }}>
                                            <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--color-cat-coral)' }}></div>
                                            <span>{t}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs mt-4 italic" style={{ color: 'var(--color-cat-coral)' }}>Estas palabras aisladas no expresan tu duda real.</p>
                            </section>
                        </div>

                        {/* Palabras Clave */}
                        <section className="bg-surface border border-line rounded-3xl p-6">
                            <h3 className="text-sm font-medium uppercase tracking-[0.2em] mb-4 flex items-center gap-2" style={{ color: 'var(--color-cat-purple)' }}>
                                <span>🔑</span> Recomendación de Palabras Clave
                            </h3>
                            <p className="text-muted text-sm mb-4">
                                Usar los términos correctos del Reglamento Interno ayuda a localizar la información rápidamente:
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {['vacaciones', 'permisos', 'horario', 'incapacidades', 'sanciones', 'dotación', 'contrato'].map((kw) => (
                                    <span key={kw} className="px-3 py-1.5 rounded-lg font-mono text-sm" style={{ background: 'var(--color-cat-purple-fill)', color: 'var(--color-cat-purple)' }}>
                                        {kw}
                                    </span>
                                ))}
                            </div>
                        </section>

                    </div>

                    {/* Mensaje inferior */}
                    <div className="mt-4 pt-6 border-t border-line text-center">
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-brand hover:bg-brand-hover transition-all rounded-full text-white font-medium tracking-wide"
                        >
                            ¡Entendido!
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default HelpGuide;
