import responseBuilderService from './services/responseBuilderService.js';
import { cleanResponse } from './utils/textProcessor.js';

const mockJson = {
  "answer": "\"steps\": [\n    \"Lee el artículo sobre acoso sexual en el ámbito laboral (ARTÍCULO 1, SECCIÓN XXVII) para entender qué constituye acoso sexual.\",\n    \"Identifica las conductas que se consideran como acoso sexual según la política de la empresa (ARTÍCULO 1, SECCIÓN XXVII, PUNTOS 3-5).\",\n    \"Si observas una conducta irregular, informa a la dirección de Recursos Humanos o a tu supervisor inmediatamente.\"\n  ]"
};

console.log("--- MOCK JSON ---");
console.log(mockJson);

const built = responseBuilderService.build(mockJson, 'PROCEDURE');
console.log("\n--- BUILT ---");
console.log(built);

const cleaned = cleanResponse(built);
console.log("\n--- CLEANED ---");
console.log(cleaned);
