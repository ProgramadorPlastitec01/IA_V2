# Auditoría del Polarity Validator

## 1. Análisis del Comportamiento Actual
El archivo `services/polarityValidator.js` implementa un LLM-as-a-Judge utilizando el modelo Llama 3.2 (o Gemma como fallback) para verificar si la respuesta final contradice la evidencia proporcionada.

### Falsos Positivos Detectados
Durante el benchmark de la Fase 2.1, detectamos que el validador bloqueó múltiples respuestas correctas o informativas bajo la excusa de "contradicción". Las consultas afectadas fueron:
1. *"¿Los visitantes pueden conservar ropa de calle debajo del overol?"*
2. *"¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?"*
3. *"¿Está permitido el uso de maquillaje dentro de la planta?"*

En todos estos casos, la respuesta fue reemplazada por: *"Lo siento, detecté una posible contradicción en mi respuesta respecto al reglamento. Por favor consulta directamente el documento."*

### Bloqueos Incorrectos
El validador está bloqueando respuestas cuando:
- La respuesta es una negación válida (ej. "No, los hombres no pueden dejarse la barba..."). Al ver la palabra "No", el LLM del validador la clasifica erróneamente como una contradicción a la evidencia, en lugar de entender que la evidencia en sí establece una prohibición y la respuesta refleja esa misma prohibición.
- El formato del prompt usa etiquetas genéricas `<|system|>` y `<|end|>`, lo cual puede confundir a modelos como Llama 3.2 que esperan un formato específico de chat (`<|start_header_id|>system<|end_header_id|>`).

### Respuestas Válidas Descartadas
- Respuestas que establecen "No especificado en el documento" ocasionalmente desencadenan el validador si la evidencia contiene fragmentos irrelevantes que el validador LLM intenta forzar como "permisos".
- Respuestas perfectamente elaboradas son interceptadas y descartadas en la última milla del pipeline.

## 2. Causas Raíz
1. **Falta de Few-Shot Examples**: El prompt actual solo contiene instrucciones teóricas (Zero-shot). Los modelos pequeños (como Llama 3.2 3B) tienen altas tasas de error en validaciones complejas si no se les proveen ejemplos.
2. **Confusión de Doble Negación**: Cuando el documento dice "Prohibido" y la respuesta dice "No se puede", el modelo de validación confunde los términos y asume que "No" = falso = contradicción.
3. **Rigidez**: Evalúa toda respuesta bajo un lente de estrictez sin considerar la "Confianza de Recuperación" (Retrieval Confidence). Si la confianza del contexto es alta (ej. > 0.75), la probabilidad de que el LLM base haya extraído bien la regla es alta, por lo que el validador debería actuar solo ante contradicciones obvias.

## 3. Conclusiones y Recomendaciones para la Fase 2.2
- Integrar un `ConfidenceValidator` que salte o flexibilice esta evaluación si la confianza de recuperación es muy alta (`>0.75`).
- Modificar el prompt de validación para incluir ejemplos (Few-shot) claros de lo que **SÍ** es una contradicción (ej. Evidencia: "Prohibido X", Respuesta: "Permitido X") y lo que **NO** lo es (ej. Evidencia: "Prohibido X", Respuesta: "No se puede hacer X").
- Mover a un enfoque de `Answer Judge` más holístico que evalúe grounding y consistencia en lugar de solo "polaridad".
