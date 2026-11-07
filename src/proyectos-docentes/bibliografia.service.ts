import { BadRequestException, Injectable } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  GuardarBibliografiaDto,
  ProyectoConBibliografiaDto,
  SeccionBibliografiaDto,
} from './dto/planeacion.dto.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { citar, primeraRepetida } from './entities/listas.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';

type Tx = Prisma.TransactionClient;

/** Cuántos proyectos se ofrecen para importar su bibliografía. */
export const PROYECTOS_PARA_IMPORTAR_MAXIMO = 30;

export function mensajeReferenciaRepetida(texto: string): string {
  return `La referencia «${citar(texto)}» está repetida.`;
}

/**
 * Punto 7 «Bibliografía» (RF-16, HU-06-07): listado numerado de referencias en texto libre,
 * sin imponer una norma de citación. Se guarda completo de una vez: el número es la posición.
 * Para reutilizar la bibliografía de otro proyecto (p2), la pantalla pide la lista de
 * proyectos con bibliografía que el usuario puede ver, lee la sección de uno de ellos y
 * agrega sus referencias al listado antes de guardarlo.
 */
@Injectable()
export class BibliografiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
    private readonly proyectos: ProyectosDocentesService,
  ) {}

  async seccion(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<SeccionBibliografiaDto> {
    await this.edicion.consultable(usuario, id);
    return this.leerSeccion(this.prisma, id);
  }

  /** RF-16, p2 a p4: reemplaza el listado numerado. Nadie más apunta a estas filas. */
  async guardar(
    usuario: UsuarioSesion,
    id: number,
    { referencias }: GuardarBibliografiaDto,
  ): Promise<SeccionBibliografiaDto> {
    const repetida = primeraRepetida(referencias);
    if (repetida !== null) {
      throw new BadRequestException(mensajeReferenciaRepetida(repetida));
    }
    return this.edicion.editar(usuario, id, async (tx) => {
      const anteriores = await this.filas(tx, id);
      await tx.bibliografia.deleteMany({ where: { id_proyecto_docente: id } });
      if (referencias.length > 0) {
        await tx.bibliografia.createMany({
          data: referencias.map((referencia, indice) => ({
            id_proyecto_docente: id,
            referencia,
            orden: indice + 1,
          })),
        });
      }
      return {
        resultado: await this.leerSeccion(tx, id),
        auditoria: {
          accion: 'actualizar',
          tabla: 'proyecto_docente',
          idRegistro: id,
          anterior: {
            bibliografia: anteriores.map((fila) => fila.referencia ?? ''),
          },
          nuevo: { bibliografia: referencias },
        },
      };
    });
  }

  /**
   * RF-16, p2: otros proyectos docentes con bibliografía que el usuario puede consultar (el
   * Docente, los suyos). Primero los de la misma asignatura y, dentro de cada grupo, los más
   * recientes.
   */
  async proyectosParaImportar(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<ProyectoConBibliografiaDto[]> {
    const proyecto = await this.edicion.consultable(usuario, id);
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    if (!visibles) {
      return [];
    }
    const buscar = (
      deLaAsignatura: Prisma.proyecto_docenteWhereInput,
      cuantos: number,
    ) =>
      cuantos <= 0
        ? Promise.resolve([])
        : this.prisma.proyecto_docente.findMany({
            where: {
              AND: [
                visibles,
                deLaAsignatura,
                { id: { not: id } },
                { bibliografia: { some: {} } },
              ],
            },
            select: {
              id: true,
              grupo: true,
              asignatura: { select: { nombre: true } },
              periodo_academico: { select: { codigo: true } },
              _count: { select: { bibliografia: true } },
            },
            orderBy: [
              { periodo_academico: { fecha_inicio: 'desc' } },
              { fecha_creacion: 'desc' },
              { id: 'desc' },
            ],
            take: cuantos,
          });

    const idAsignatura = proyecto.id_asignatura;
    const misma =
      idAsignatura === null
        ? []
        : await buscar(
            { id_asignatura: idAsignatura },
            PROYECTOS_PARA_IMPORTAR_MAXIMO,
          );
    const otras = await buscar(
      idAsignatura === null
        ? {}
        : {
            OR: [
              { id_asignatura: { not: idAsignatura } },
              { id_asignatura: null },
            ],
          },
      PROYECTOS_PARA_IMPORTAR_MAXIMO - misma.length,
    );
    return [
      ...misma.map((fila) => ({ fila, mismaAsignatura: true })),
      ...otras.map((fila) => ({ fila, mismaAsignatura: false })),
    ].map(({ fila, mismaAsignatura }) => ({
      id: fila.id,
      asignatura: fila.asignatura?.nombre ?? '',
      periodo: fila.periodo_academico?.codigo ?? null,
      grupo: fila.grupo,
      referencias: fila._count.bibliografia,
      mismaAsignatura,
    }));
  }

  private filas(cliente: Tx | PrismaService, id: number) {
    return cliente.bibliografia.findMany({
      where: { id_proyecto_docente: id },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  private async leerSeccion(
    cliente: Tx | PrismaService,
    id: number,
  ): Promise<SeccionBibliografiaDto> {
    const filas = await this.filas(cliente, id);
    return {
      referencias: filas.map((fila, indice) => ({
        id: fila.id,
        numero: indice + 1,
        referencia: fila.referencia ?? '',
      })),
    };
  }
}
