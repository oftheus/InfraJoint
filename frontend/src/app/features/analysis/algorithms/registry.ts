/**
 * Os algoritmos disponíveis.
 *
 * "Cadastrar" um algoritmo é acrescentar uma linha aqui — não há catálogo em banco,
 * que seria uma segunda fonte da verdade capaz de divergir desta.
 */

import { ResearchAlgorithm } from './algorithm.model';
import { thermalAsymmetry } from './thermal-asymmetry';

export const RESEARCH_ALGORITHMS: readonly ResearchAlgorithm[] = [thermalAsymmetry];
