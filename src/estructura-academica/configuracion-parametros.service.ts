import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { ClaveParametro } from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { PARAMETROS } from '../datos-iniciales/catalogos.js';
import type {
  CambiarParametroDto,
  ListaParametrosDto,
  ParametroDto,
} from './dto/parametros.dto.js';
import {
  CLAVES_PARAMETRO,
  DEFINICION_PARAMETRO,
  elementosDe,
  esClaveParametro,
  MENSAJE_PARAMETRO_NO_EXISTE,
  validarValor,
} from './reglas-parametros.js';

const SELECCION = {
  id: true,
  clave: true,
  valor: true,
  descripcion: true,
  updated_at: true,
  usuario: { select: { nombres: true, apellidos: true } },
} as const;

interface FilaParametro {
  id: number;
  clave: string | null;
  valor: string | null;
  descripcion: string | null;
  updated_at: Date | null;
  usuario: { nombres: string | null; apellidos: string | null } | null;
}

/**
 * HU-03-07: consulta y edición de los parámetros de negocio de `parametro_sistema`.
 *
 * Solo existen para esta pantalla las claves de `PARAMETRO`, las que el código lee: no se crean
 * ni se borran parámetros, y una fila con otra clave no se muestra ni se edita. El secreto y la
 * vigencia del JWT son variables de entorno (NFR-003) y no pasan por aquí.
 *
 * El cambio rige desde la siguiente petición, sin redesplegar: `ParametrosService` lee el valor
 * de la base en cada uso y no guarda copias.
 */
@Injectable()
export class ConfiguracionParametrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Los parámetros editables, en el orden de `PARAMETRO`. No se pagina: es un catálogo fijo. */
  async listar(): Promise<ListaParametrosDto> {
    const filas = await this.prisma.parametro_sistema.findMany({
      where: { clave: { in: [...CLAVES_PARAMETRO] } },
      select: SELECCION,
    });
    const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
    return {
      elementos: CLAVES_PARAMETRO.map((clave) =>
        aParametro(clave, porClave.get(clave) ?? null),
      ),
    };
  }

  /**
   * Cambia el valor de un parámetro, lo deja a nombre de quien lo cambió y lo audita con el
   * valor anterior y el nuevo. Si el valor es el que ya tenía, no escribe ni audita.
   */
  async cambiar(
    clave: string,
    datos: CambiarParametroDto,
    usuario: UsuarioSesion,
  ): Promise<ParametroDto> {
    if (!esClaveParametro(clave)) {
      throw new NotFoundException(MENSAJE_PARAMETRO_NO_EXISTE);
    }
    const definicion = DEFINICION_PARAMETRO[clave];
    const valor = validarValor(definicion, datos);

    const anterior = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: SELECCION,
    });
    if (anterior?.valor === valor) {
      return aParametro(clave, anterior);
    }

    // Una base sin los datos base no tiene la fila: se crea con la descripción inicial.
    const inicial = PARAMETROS.find((parametro) => parametro.clave === clave);
    const guardado = await this.prisma.parametro_sistema.upsert({
      where: { clave },
      create: {
        clave,
        valor,
        tipo_dato: definicion.tipo,
        descripcion: inicial?.descripcion ?? null,
        id_actualizado_por: usuario.id,
      },
      update: { valor, id_actualizado_por: usuario.id },
      select: SELECCION,
    });

    // La clave acompaña al valor: el id de la fila no le dice nada a quien consulta la auditoría.
    await this.auditoria.registrar({
      accion: anterior ? 'actualizar' : 'crear',
      tablaAfectada: 'parametro_sistema',
      idRegistro: guardado.id,
      ...(anterior ? { valorAnterior: { clave, valor: anterior.valor } } : {}),
      valorNuevo: { clave, valor },
    });
    return aParametro(clave, guardado);
  }
}

function aParametro(
  clave: ClaveParametro,
  fila: FilaParametro | null,
): ParametroDto {
  const definicion = DEFINICION_PARAMETRO[clave];
  const valor = fila?.valor ?? null;
  const autor = fila?.usuario
    ? [fila.usuario.nombres, fila.usuario.apellidos]
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';
  return {
    clave,
    // El tipo es el que el código espera al leerlo, no el texto de `tipo_dato`.
    tipoDato: definicion.tipo,
    valor,
    elementos: elementosDe(definicion, valor),
    descripcion: fila?.descripcion ?? null,
    minimo: definicion.tipo === 'entero' ? definicion.rango.minimo : null,
    maximo: definicion.tipo === 'entero' ? definicion.rango.maximo : null,
    admiteVacia: definicion.tipo === 'lista' && definicion.admiteVacia,
    elementosPermitidos:
      definicion.tipo === 'lista' && definicion.permitidos
        ? [...definicion.permitidos]
        : null,
    actualizadoEn: fila?.updated_at?.toISOString() ?? null,
    actualizadoPor: autor === '' ? null : autor,
  };
}
