import { motion } from 'framer-motion';
import { ChevronRightIcon, HandsHelpingIcon, FileAltIcon, QuestionIcon, BookOpenIcon, CommentDotsIcon } from './shared.jsx';

/**
 * HomeView — pantalla de inicio del kiosco (rediseño 2026-10-09).
 * Tarjeta protagonista "Pregúntale a la IA" + accesos a Documentos, FAQ,
 * Guía de uso y Buzón de Sugerencias. Replica la jerarquía visual del
 * prototipo de referencia (plastitec_hr_kiosk_prototype.html).
 */
const MODULES = [
    { id: 'documents', Icon: FileAltIcon, color: 'blue', title: 'Documentos Disponibles', desc: 'Reglamentos, códigos y políticas oficiales.' },
    { id: 'faqs', Icon: QuestionIcon, color: 'purple', title: 'Preguntas Frecuentes', desc: 'Las dudas más consultadas, agrupadas por tema.' },
    { id: 'guide', Icon: BookOpenIcon, color: 'amber', title: '¿Cómo usar el asistente?', desc: 'Guía rápida para obtener mejores respuestas.' },
    { id: 'suggestions', Icon: CommentDotsIcon, color: 'rose', title: 'Buzón de Sugerencias', desc: 'Comentarios, reportes y felicitaciones.' },
];

const MODULE_COLORS = {
    blue: 'bg-blue-100 text-blue-600 group-hover:bg-blue-200',
    purple: 'bg-purple-100 text-purple-600 group-hover:bg-purple-200',
    amber: 'bg-amber-100 text-amber-600 group-hover:bg-amber-200',
    rose: 'bg-rose-100 text-rose-600 group-hover:bg-rose-200',
};

const HomeView = ({ onNavigate }) => (
    <section className="flex-1 flex flex-col p-6 md:p-8 overflow-y-auto bg-kiosk-bg">
        <div className="text-center max-w-2xl mx-auto mb-6">
            <h2 className="text-2xl md:text-3xl font-extrabold text-kiosk-text tracking-tight">Bienvenido</h2>
            <p className="text-sm md:text-base text-kiosk-muted mt-1">Selecciona una opción para comenzar. ¿Cómo podemos ayudarte hoy?</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl mx-auto w-full flex-1">

            {/* Tarjeta protagonista: Preguntar a la IA — azul pastel de marca (igual al resto del app) */}
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                onClick={() => onNavigate('chat')}
                className="lg:col-span-7 bg-gradient-to-br from-blue-50 via-white to-white border-2 border-brand/60 rounded-3xl p-6 md:p-8 flex flex-col justify-between hover:border-brand transition-all duration-300 cursor-pointer shadow-md group relative overflow-hidden"
                style={{ boxShadow: '0 0 25px rgba(24,95,165,0.15)' }}
            >
                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-brand/10 rounded-full blur-2xl group-hover:bg-brand/20 transition-all" />
                <div>
                    <div className="w-14 h-14 rounded-2xl bg-brand text-white flex items-center justify-center shadow-md mb-4 group-hover:scale-110 transition-transform">
                        <HandsHelpingIcon size={28} />
                    </div>
                    <span className="inline-block bg-brand-light text-brand text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-2">Recomendado</span>
                    <h3 className="text-2xl md:text-3xl font-bold text-kiosk-text group-hover:text-brand transition-colors">Pregúntale a RITA</h3>
                    <p className="text-sm md:text-base text-kiosk-muted mt-2">Resuelve tus dudas al instante sobre políticas, vacaciones, permisos y reglamentos de la empresa.</p>
                </div>
                <div className="mt-6 flex items-center justify-between pt-4 border-t border-kiosk-border">
                    <span className="text-xs text-kiosk-muted font-medium">Escribe o dicta tu pregunta con voz</span>
                    <div className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center space-x-2 shadow-sm transition-colors">
                        <span>Iniciar Consulta</span>
                        <ChevronRightIcon />
                    </div>
                </div>
            </motion.div>

            {/* Módulos secundarios */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {MODULES.map((m, i) => (
                    <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 * (i + 1) }}
                        onClick={() => onNavigate(m.id)}
                        className="bg-kiosk-panel hover:bg-kiosk-card-hover border border-kiosk-border rounded-2xl p-4 flex items-center space-x-4 cursor-pointer transition-all group shadow-sm"
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${MODULE_COLORS[m.color]}`}>
                            <m.Icon size={20} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-kiosk-text text-sm md:text-base transition-colors">{m.title}</h4>
                            <p className="text-xs text-kiosk-muted mt-0.5">{m.desc}</p>
                        </div>
                        <span className="text-kiosk-muted"><ChevronRightIcon /></span>
                    </motion.div>
                ))}
            </div>
        </div>
    </section>
);

export default HomeView;
