import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'urap:es-publico';

/**
 * Marca un endpoint (o un controlador entero) como público. Todo lo demás exige
 * autenticación: un endpoint sin declaración explícita queda cerrado, no abierto.
 */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
