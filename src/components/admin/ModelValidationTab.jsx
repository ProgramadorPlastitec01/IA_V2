import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../utils/apiConfig';
import { Card, StatCard, ConfirmModal, VerdictBadge, Badge, PlayIcon, FlaskIcon, CheckIcon, XIcon } from './AdminUI';

const SAMPLE_SIZE = 10;

const ModelValidationTab = () => {
    const [dataset, setDataset] = useState({ version: '', count: 0, productionModel: '' });
    const [availableModels, setAvailableModels] = useState([]);
    const [candidateModel, setCandidateModel] = useState('');
    const [includeReranker, setIncludeReranker] = useState(false);
    const [running, setRunning] = useState(false);
    const [run, setRun] = useState(null); // { runId, summary, details }
    const [showAllQuestions, setShowAllQuestions] = useState(false);
    const [confirmPromote, setConfirmPromote] = useState(false);
    const [promoting, setPromoting] = useState(false);
    const [promoted, setPromoted] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const [dsRes, modelsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/model-benchmark/dataset`),
                    fetch(`${API_BASE_URL}/api/model-benchmark/available-models`),
                ]);
                const ds = await dsRes.json();
                const models = await modelsRes.json();
                setDataset(ds);
                setAvailableModels(models.models || []);
                if (models.models?.length) setCandidateModel(models.models[0]);
            } catch (err) {
                console.error('Error loading benchmark config:', err);
            }
        })();
    }, []);

    const runBenchmark = async () => {
        if (!candidateModel.trim()) return;
        setRunning(true);
        setError(null);
        setPromoted(false);
        try {
            const res = await fetch(`${API_BASE_URL}/api/model-benchmark/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateModel: candidateModel.trim(), includeReranker }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error ejecutando el benchmark');
            setRun(data);
            setShowAllQuestions(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(false);
        }
    };

    const promoteCandidate = async () => {
        if (!run) return;
        setPromoting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/model-benchmark/promote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId: run.runId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPromoted(true);
            setDataset(d => ({ ...d, productionModel: data.promotedModel }));
        } catch (err) {
            setError(err.message);
        } finally {
            setPromoting(false);
            setConfirmPromote(false);
        }
    };

    const summary = run?.summary;
    const details = run?.details || [];
    const visibleDetails = showAllQuestions ? details : details.slice(0, SAMPLE_SIZE);

    return (
        <div className="flex-grow overflow-auto custom-scrollbar font-admin-sans pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-lg font-semibold text-admin-ink">Banco de pruebas de modelos</h2>
                    <p className="text-xs text-admin-muted mt-0.5">
                        {dataset.count} preguntas versionadas · {dataset.version}
                    </p>
                </div>
                <button
                    onClick={runBenchmark}
                    disabled={running || !candidateModel.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-admin-accent hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-opacity"
                >
                    <PlayIcon size={15} />
                    {running ? 'Ejecutando…' : 'Ejecutar benchmark'}
                </button>
            </div>

            {run?.summary?.simulated && (
                <div className="mb-4 text-[11px] text-admin-faint bg-admin-bg border border-admin-border rounded-lg px-3 py-2">
                    Resultados simulados (determinísticos por semilla) — no existe aún un runner con LLM-judge en vivo contra Ollama para 150 preguntas en este repo. Infraestructura real más cercana: <code className="font-admin-mono">tests/test_enterprise_real_benchmark.js</code>.
                </div>
            )}

            <Card className="p-4 mb-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-[11px] uppercase text-admin-faint font-medium mb-1.5">Modelo en producción</label>
                        <div className="px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-sm font-admin-mono text-admin-ink">
                            {dataset.productionModel || '—'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase text-admin-faint font-medium mb-1.5">Modelo candidato</label>
                        {availableModels.length > 0 ? (
                            <select
                                value={candidateModel}
                                onChange={(e) => setCandidateModel(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-admin-border bg-admin-card text-sm font-admin-mono text-admin-ink"
                            >
                                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={candidateModel}
                                onChange={(e) => setCandidateModel(e.target.value)}
                                placeholder="ej. llama3.3:8b"
                                className="w-full px-3 py-2 rounded-lg border border-admin-border bg-admin-card text-sm font-admin-mono text-admin-ink placeholder:text-admin-faint"
                            />
                        )}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-admin-ink">
                        <input type="checkbox" checked={includeReranker} onChange={(e) => setIncludeReranker(e.target.checked)} className="w-4 h-4 accent-[#3D3A8C]" />
                        Incluir Cross-Encoder (bge-reranker-base)
                    </label>
                </div>
                {error && <p className="text-xs text-admin-error mt-3">{error}</p>}
            </Card>

            {summary && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                        <StatCard label="Alucinaciones" current={summary.hallucinations.current} candidate={summary.hallucinations.candidate} betterWhen="lower" />
                        <StatCard label="Confianza promedio" current={summary.avgConfidence.current} candidate={summary.avgConfidence.candidate} betterWhen="higher" format={(v) => v.toFixed(3)} />
                        <StatCard label="Citas correctas" current={summary.citationAccuracy.current} candidate={summary.citationAccuracy.candidate} betterWhen="higher" format={(v) => `${v}%`} />
                        <StatCard label="Tiempo promedio" current={summary.avgLatencySeconds.current} candidate={summary.avgLatencySeconds.candidate} betterWhen="lower" format={(v) => `${v}s`} />
                    </div>

                    {summary.candidateModelAvailable === false && (
                        <div className="mb-4 text-xs text-admin-warning bg-admin-warning-soft border border-admin-warning/20 rounded-lg px-3 py-2">
                            El modelo candidato "{summary.candidateModel}" no aparece entre los modelos descargados en Ollama ahora mismo — revísalo antes de promoverlo a producción.
                        </div>
                    )}

                    <Card className="overflow-hidden mb-5">
                        <div className="px-4 py-3 border-b border-admin-border bg-admin-bg">
                            <h3 className="text-sm font-semibold text-admin-ink">Detalle por pregunta (muestra)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-admin-faint uppercase text-[10px] border-b border-admin-border">
                                        <th className="px-4 py-2 font-medium">Pregunta</th>
                                        <th className="px-3 py-2 font-medium text-right">Conf. actual</th>
                                        <th className="px-3 py-2 font-medium text-right">Conf. candidato</th>
                                        <th className="px-3 py-2 font-medium text-center">Cita actual</th>
                                        <th className="px-3 py-2 font-medium text-center">Cita cand.</th>
                                        <th className="px-3 py-2 font-medium text-right">Veredicto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleDetails.map(d => (
                                        <tr key={d.id} className="border-b border-admin-border last:border-0">
                                            <td className="px-4 py-2.5 text-admin-ink max-w-xs truncate" title={d.pregunta}>"{d.pregunta}"</td>
                                            <td className="px-3 py-2.5 text-right font-admin-mono text-admin-ink">{d.currentConfidence.toFixed(2)}</td>
                                            <td className="px-3 py-2.5 text-right font-admin-mono text-admin-ink">{d.candidateConfidence.toFixed(2)}</td>
                                            <td className="px-3 py-2.5 text-center">
                                                {d.currentCitationCorrect ? <CheckIcon size={14} className="inline text-admin-success" /> : <XIcon size={14} className="inline text-admin-error" />}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {d.candidateCitationCorrect ? <CheckIcon size={14} className="inline text-admin-success" /> : <XIcon size={14} className="inline text-admin-error" />}
                                            </td>
                                            <td className="px-3 py-2.5 text-right"><VerdictBadge verdict={d.verdict} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            onClick={() => setShowAllQuestions(s => !s)}
                            className="px-4 py-2 bg-admin-card border border-admin-border rounded-lg text-xs font-medium text-admin-ink hover:bg-admin-bg transition-colors"
                        >
                            {showAllQuestions ? 'Ver solo la muestra' : `Ver las ${details.length} preguntas`}
                        </button>
                        {promoted ? (
                            <Badge tone="success">Candidato promovido a producción</Badge>
                        ) : (
                            <button
                                onClick={() => setConfirmPromote(true)}
                                className="px-4 py-2 bg-admin-ink hover:opacity-90 text-white rounded-lg text-xs font-medium transition-opacity"
                            >
                                Promover candidato a producción
                            </button>
                        )}
                    </div>
                </>
            )}

            {!summary && !running && (
                <div className="text-center py-16 text-admin-faint text-sm flex flex-col items-center gap-2">
                    <FlaskIcon size={28} />
                    Ejecuta el benchmark para comparar el modelo en producción contra el candidato.
                </div>
            )}

            <ConfirmModal
                open={confirmPromote}
                title="¿Promover este candidato a producción?"
                body={`Esto cambiará OLLAMA_MODEL de "${dataset.productionModel}" a "${run?.summary?.candidateModel}" de forma inmediata en el .env y en el proceso en ejecución.`}
                confirmLabel="Promover"
                tone="error"
                busy={promoting}
                onConfirm={promoteCandidate}
                onCancel={() => setConfirmPromote(false)}
            />
        </div>
    );
};

export default ModelValidationTab;
