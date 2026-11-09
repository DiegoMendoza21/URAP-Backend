import { BadRequestException, Injectable } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  GuardarEstrategiasDto,
  SeccionEstrategiasDto,
} from './dto/planeacion.dto.js';
import { auditarCambios } from './auditar-seccion.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { citar, claveTexto, primeraRepetida } from './entities/listas.js';

type Tx = Prisma.TransactionClient;

/** Cuántas estrategias de otros proyectos del programa se sugieren como máximo. */
export const SUGERIDAS_MAXIMO = 20;

export function mensajeEstrategiaRepetida(texto: string): string {
  return `La estrategia «${citar(texto)}» está repetida.`;
}

/**
 * Los textos de `lista` que no están en `vistas`, en su orden y sin repetir. Los que devuelve
 * pasan a `vistas`, para que el grupo siguiente no los vuelva a ofrecer.
 */
function sinLasVistas(lista: readonly string[], vistas: Set<string>): string[] {
  const nuevas: string[] = [];
  for (const texto of lista) {
    const clave = claveTexto(texto);
    if (clave && !vistas.has(clave)) {
      vistas.add(clave);
      nuevas.push(texto.trim());
    }
  }
  return nuevas;
}

/**
 * Punto 4 «Estrategias metodológicas» (RF-13, HU-06-04): un listado ordenado que el docente
 * redacta o arma con el catálogo sugerido, y que puede reordenar y depurar. Se guarda completo
 * de una vez: el orden es la posición en el listado.
 */
@Injectable()
export class EstrategiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
    private readonly parametros: ParametrosService,
  ) {}

  async seccion(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<SeccionEstrategiasDto> {
    await this.edicion.consultable(usuario, id);
    return this.leerSeccion(this.prisma, id);
  }

  /**
   * RF-13, p2 a p4: reemplaza el listado. Las filas no tienen referencias desde otras
   * tablas, por eso se recrean en vez de reordenarse una por una.
   */
  async guardar(
    usuario: UsuarioSesion,
    id: number,
    { estrategias }: GuardarEstrategiasDto,
  ): Promise<SeccionEstrategiasDto> {
    const repetida = primeraRepetida(estrategias);
    if (repetida !== null) {
      throw new BadRequestException(mensajeEstrategiaRepetida(repetida));
    }
    await this.edicion.editar(usuario, id, async (tx) => {
      const anteriores = await this.filas(tx, id);
      await tx.estrategia_metodologica.deleteMany({
        where: { id_proyecto_docente: id },
      });
      if (estrategias.length > 0) {
        await tx.estrategia_metodologica.createMany({
          data: estrategias.map((descripcion, indice) => ({
            id_proyecto_docente: id,
            descripcion,
            orden: indice + 1,
          })),
        });
      }
      return {
        resultado: undefined,
        // Solo si la lista cambió: guardar lo mismo no audita ni mueve la fecha.
        auditoria: auditarCambios(
          'proyecto_docente',
          id,
          { estrategias: anteriores.map((fila) => fila.descripcion ?? '') },
          { estrategias },
        ),
      };
    });
    // Fuera de la transacción: el catálogo recorre el programa y no debe alargar el bloqueo.
    return this.leerSeccion(this.prisma, id);
  }

  private filas(cliente: Tx | PrismaService, id: number) {
    return cliente.estrategia_metodologica.findMany({
      where: { id_proyecto_docente: id },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * El listado y lo que se sugiere agregar (RF-13, p2), en tres grupos: el catálogo del MEN de
   * enseñanza, el de aprendizaje y lo que usan otros proyectos del programa. Ninguna sugerencia
   * está ya en el proyecto, y ninguna sale en dos grupos: cada grupo descarta las anteriores.
   */
  private async leerSeccion(
    cliente: Tx | PrismaService,
    id: number,
  ): Promise<SeccionEstrategiasDto> {
    // Sin un parámetro, ParametrosService registra el error y su grupo queda vacío.
    const [filas, ensenanza, aprendizaje] = await Promise.all([
      this.filas(cliente, id),
      this.parametros.leerTextos(PARAMETRO.catalogoEstrategiasEnsenanza),
      this.parametros.leerTextos(PARAMETRO.catalogoEstrategiasAprendizaje),
    ]);
    const estrategias = filas.map((fila, indice) => ({
      id: fila.id,
      numero: indice + 1,
      descripcion: fila.descripcion ?? '',
    }));
    const vistas = new Set(
      estrategias.map((estrategia) => claveTexto(estrategia.descripcion)),
    );
    const catalogo = {
      ensenanza: sinLasVistas(ensenanza, vistas),
      aprendizaje: sinLasVistas(aprendizaje, vistas),
    };
    const sugeridas = await this.usadasEnElPrograma(cliente, id, vistas);
    return { estrategias, catalogo, sugeridas };
  }

  /**
   * Las estrategias que más usan los otros proyectos docentes del mismo programa, sin las de
   * `descartar` (las del proyecto y las del catálogo del MEN, que ya se ofrecen).
   */
  private async usadasEnElPrograma(
    cliente: Tx | PrismaService,
    id: number,
    descartar: ReadonlySet<string>,
  ): Promise<string[]> {
    const proyecto = await cliente.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: {
        asignatura: {
          select: { plan_estudio: { select: { id_programa: true } } },
        },
      },
    });
    const idPrograma = proyecto.asignatura?.plan_estudio.id_programa;
    if (!idPrograma) {
      return [];
    }
    const grupos = await cliente.estrategia_metodologica.groupBy({
      by: ['descripcion'],
      where: {
        descripcion: { not: null },
        proyecto_docente: {
          is: {
            id: { not: id },
            asignatura: { is: { plan_estudio: { id_programa: idPrograma } } },
          },
        },
      },
      _count: { descripcion: true },
      orderBy: [{ _count: { descripcion: 'desc' } }, { descripcion: 'asc' }],
      // Holgura para las que se descartan después y para las variantes de escritura de una
      // misma estrategia, que pueden quedar en grupos distintos.
      take: SUGERIDAS_MAXIMO * 3 + descartar.size,
    });
    const usadas = grupos.flatMap(({ descripcion }) => descripcion ?? []);
    return sinLasVistas(usadas, new Set(descartar)).slice(0, SUGERIDAS_MAXIMO);
  }
}
