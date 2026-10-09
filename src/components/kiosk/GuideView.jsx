import { ViewTopBar } from './shared.jsx';

/**
 * GuideView — "¿Cómo usar el asistente?" (rediseño 2026-10-09).
 * Combina los 3 pasos visuales del prototipo con el contenido real de
 * convenciones de uso que ya existía en HelpGuide.jsx (ejemplos correctos/
 * incorrectos, palabras clave, aviso de "una pregunta a la vez").
 */
const GuideView = ({ onHome, onNavigate }) => (
    <section className="flex-1 flex flex-col h-full overflow-hidden bg-kiosk-bg">
        <ViewTopBar title="Guía Rápida: ¿Cómo usar el asistente?" onHome={onHome} />

        <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto w-full space-y-8">
            <div className="text-center max-w-lg mx-auto">
                <h2 className="text-xl md:text-2xl font-bold text-kiosk-text">Obtén tu respuesta en menos de 30 segundos</h2>
                <p className="text-xs md:text-sm text-kiosk-muted mt-1">Diseñado para ser rápido, intuitivo y accesible para todo el personal de Plastitec.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { n: 1, icon: '⌨️', bg: 'bg-blue-50', title: 'Escribe o Dicta', text: 'Selecciona "Pregúntale a la IA" y escribe tu duda con el teclado táctil o presiona el micrófono para dictar por voz.', tip: 'Tip: Usa las sugerencias rápidas.', tipColor: 'text-kiosk-accent' },
                    { n: 2, icon: '🧠', bg: 'bg-blue-50', title: 'Consulta Instantánea', text: 'El sistema analiza los documentos oficiales y te entrega la respuesta exacta junto con la fuente documental.', tip: 'Verificado con reglamentos vigentes.', tipColor: 'text-blue-600' },
                    { n: 3, icon: '😊', bg: 'bg-purple-50', title: 'Califica y Listo', text: 'Califica con un solo toque si te sirvió la respuesta. El kiosco se reinicia automáticamente tras cada consulta.', tip: '1 toque para calificar.', tipColor: 'text-purple-600' },
                ].map(step => (
                    <div key={step.n} className="bg-kiosk-card border border-kiosk-border rounded-3xl p-6 relative flex flex-col justify-between shadow-sm">
                        <div className="absolute -top-4 left-6 w-8 h-8 rounded-full bg-kiosk-accent text-white font-black flex items-center justify-center text-sm shadow-md">{step.n}</div>
                        <div className="space-y-4 pt-2">
                            <div className={`w-14 h-14 rounded-2xl ${step.bg} flex items-center justify-center text-2xl`}>{step.icon}</div>
                            <h4 className="font-bold text-kiosk-text text-base">{step.title}</h4>
                            <p className="text-xs text-kiosk-muted leading-relaxed">{step.text}</p>
                        </div>
                        <div className={`mt-6 pt-3 border-t border-kiosk-border text-[11px] font-semibold ${step.tipColor}`}>{step.tip}</div>
                    </div>
                ))}
            </div>

            {/* Una pregunta a la vez */}
            <section className="rounded-3xl p-6 border bg-amber-50 border-amber-300">
                <h3 className="text-sm font-medium uppercase tracking-[0.2em] mb-3 flex items-center gap-2 text-amber-700">
                    <span>☝️</span> Una pregunta a la vez
                </h3>
                <p className="text-kiosk-text leading-relaxed">
                    El asistente <strong className="font-semibold">no es un chat</strong>: no recuerda tu pregunta anterior.
                    Si tienes otra duda, escríbela completa como una pregunta nueva.
                </p>
                <p className="text-sm mt-3 text-kiosk-text">
                    <span className="line-through text-kiosk-muted">"¿Y si es mi hijo?"</span>
                    <span className="mx-2">→</span>
                    <span>"Si mi hijo se enferma, ¿puedo pedir permiso para cuidarlo?"</span>
                </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="rounded-3xl p-6 border bg-emerald-50 border-emerald-300">
                    <h3 className="text-base font-medium flex items-center gap-2 mb-4 text-emerald-700">
                        <span className="text-xl">✅</span> Ejemplos Correctos
                    </h3>
                    <ul className="space-y-4">
                        {[
                            '"¿Cuántos días de vacaciones tengo al cumplir un año?"',
                            '"¿Cuál es el horario laboral de lunes a viernes?"',
                            '"¿Qué pasa si llego tarde sin justificación?"',
                        ].map((t, i) => (
                            <li key={i} className="flex items-start gap-3 text-kiosk-text">
                                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-emerald-600" />
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="rounded-3xl p-6 border bg-rose-50 border-rose-300">
                    <h3 className="text-base font-medium flex items-center gap-2 mb-4 text-rose-700">
                        <span className="text-xl">❌</span> Ejemplos Incorrectos
                    </h3>
                    <ul className="space-y-4">
                        {['"vacaciones"', '"horario"', '"tarde"'].map((t, i) => (
                            <li key={i} className="flex items-start gap-3 text-kiosk-muted line-through decoration-rose-400">
                                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-rose-500" />
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs mt-4 italic text-rose-700">Estas palabras aisladas no expresan tu duda real.</p>
                </section>
            </div>

            <section className="bg-kiosk-panel border border-kiosk-border rounded-3xl p-6">
                <h3 className="text-sm font-medium uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-purple-700">
                    <span>🔑</span> Recomendación de Palabras Clave
                </h3>
                <p className="text-kiosk-muted text-sm mb-4">
                    Usar los términos correctos del Reglamento Interno ayuda a localizar la información rápidamente:
                </p>
                <div className="flex flex-wrap gap-3">
                    {['vacaciones', 'permisos', 'horario', 'incapacidades', 'sanciones', 'dotación', 'contrato'].map((kw) => (
                        <span key={kw} className="px-3 py-1.5 rounded-lg font-mono text-sm bg-purple-50 text-purple-700">{kw}</span>
                    ))}
                </div>
            </section>

            <div className="text-center pt-2 pb-4">
                <button onClick={() => onNavigate('chat')} className="bg-kiosk-accent hover:bg-kiosk-accent-hover text-white px-8 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md">
                    ¡Probar Asistente IA ahora!
                </button>
            </div>
        </div>
    </section>
);

export default GuideView;
