import qdrantService from "../services/qdrantService.js";
const terms = ["aspirante","condiciones de admisión","estado civil","libreta militar","prueba de embarazo","examen de sida","religión","partido político","aspirantes","proceso de selección"];
const kwQuery = terms.join(" ");
console.log("kwQuery:", kwQuery);
const res = await qdrantService.searchKeyword(kwQuery, 15);
res.forEach((r,i)=>console.log(i+1, r.score?.toFixed(3), r.payload?.chunk_index, r.payload?.fuente));
process.exit(0);
