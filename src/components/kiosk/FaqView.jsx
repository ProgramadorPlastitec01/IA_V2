import { FAQS, FaqCard, ViewTopBar } from './shared.jsx';

/**
 * FaqView — "Preguntas Frecuentes" (rediseño 2026-10-09).
 * A diferencia del prototipo visual (que mostraba respuestas estáticas en un
 * acordeón), aquí cada pregunta dispara la consulta REAL contra el backend
 * RAG — igual que los chips de FAQ del chat — para no mostrar nunca una
 * respuesta desactualizada respecto a los documentos oficiales vigentes.
 */
const FaqView = ({ onHome, onPick }) => (
    <section className="flex-1 flex flex-col h-full overflow-hidden bg-kiosk-bg">
        <ViewTopBar title="Preguntas Frecuentes" onHome={onHome} />

        <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto w-full space-y-6">
            <div className="text-center max-w-lg mx-auto">
                <h2 className="text-xl font-bold text-kiosk-text">Las dudas más consultadas</h2>
                <p className="text-xs text-kiosk-muted mt-1">Toca cualquier pregunta para que la IA te dé la respuesta verificada con base en los documentos oficiales.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FAQS.map((faq, i) => (
                    <FaqCard key={i} faq={faq} featured={i === 0} onPick={onPick} />
                ))}
            </div>
        </div>
    </section>
);

export default FaqView;
