import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  GuardarContenidosDto,
  SeccionContenidosDto,
  SemanaContenidoDto,
} from './dto/planeacion.dto.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { compararHoras } from './entities/horas.js';
import { camposFaltantes } from './entities/informacion-institucional.js';
import {
  MENSAJE_PERIODO_SIN_SEMANAS,
  semanasSinTema,
} from './entities/secciones.js';

type Tx = Prisma.TransactionClient;

type Fila = Omit<SemanaContenidoDto, 'id' | 'semana'>;

export function mensajeSemanaRepetida(semana: number): string {
  return `La semana ${semana} está repetida.`;
}

export function mensajeSemanaFueraDelPeriodo(
  semana: number,
  numeroSemanas: number,
): string {
  return `El período académico tiene ${numeroSemanas} semanas: no existe la semana ${semana}.`;
}

const VACIA: Fila = {
  tema: null,
  horasTde: null,
  horasTdp: null,
  horasTi: null,
};

function esVacia(fila: Fila): boolean {
  return (
    fila.tema === null &&
    fila.horasTde === null &&
    fila.horasTdp === null &&
    fila.horasTi === null
  );
}

function iguales(a: Fila, b: Fila): boolean {
  return (
    a.tema === b.tema &&
    a.horasTde === b.horasTde &&
    a.horasTdp === b.horasTdp &&
    a.horasTi === b.horasTi
  );
}

function aColumnas(fila: Fila) {
  return {
    tema: fila.tema,
    horas_tde: fila.horasTde,
    horas_tdp: fila.horasTdp,
    horas_ti: fila.horasTi,
  };
}

function deColumnas(fila: {
  tema: string | null;
  horas_tde: number | null;
  horas_tdp: number | null;
  horas_ti: number | null;
}): Fila {
  return {
    tema: fila.tema?.trim() ? fila.tema : null,
    horasTde: fila.horas_tde,
    horasTdp: fila.horas_tdp,
    horasTi: fila.horas_ti,
  };
}

/**
 * Punto 6 «Contenidos del curso» (RF-15, HU-06-06): una fila por semana del período con el
 * tema previsto y las horas TDE, TDP y TI, comparadas con las de la asignatura.
 *
 * Estas filas son la lista de temas del registro de clase (RF-20, HU-08-04): `sesion_tema`
 * apunta a ellas. Por eso nunca se borran: una semana que se vacía conserva su fila, con
 * tema y horas en nulo, y cada semana se busca por `(id_proyecto_docente, semana)`, que es
 * única.
 */
@Injectable()
export class ContenidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
  ) {}

  async seccion(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<SeccionContenidosDto> {
    await this.edicion.consultable(usuario, id);
    return this.leerSeccion(this.prisma, id);
  }

  /**
   * RF-15, p3 a p5: guarda la tabla completa. Una diferencia de horas con la asignatura no
   * impide guardar (p4): se advierte en la respuesta y queda constancia en la auditoría.
   */
  async guardar(
    usuario: UsuarioSesion,
    id: number,
    { semanas }: GuardarContenidosDto,
  ): Promise<SeccionContenidosDto> {
    const vistas = new Set<number>();
    for (const { semana } of semanas) {
      if (vistas.has(semana)) {
        throw new BadRequestException(mensajeSemanaRepetida(semana));
      }
      vistas.add(semana);
    }

    return this.edicion.editar(usuario, id, async (tx) => {
      const proyecto = await tx.proyecto_docente.findUniqueOrThrow({
        where: { id },
        select: { periodo_academico: { select: { numero_semanas: true } } },
      });
      const numeroSemanas = proyecto.periodo_academico?.numero_semanas;
      if (!numeroSemanas) {
        throw new ConflictException(MENSAJE_PERIODO_SIN_SEMANAS);
      }
      const fuera = semanas.find(({ semana }) => semana > numeroSemanas);
      if (fuera) {
        throw new BadRequestException(
          mensajeSemanaFueraDelPeriodo(fuera.semana, numeroSemanas),
        );
      }

      const enviadas = new Map(
        semanas.map((semana) => [
          semana.semana,
          {
            tema: semana.tema ?? null,
            horasTde: semana.horasTde ?? null,
            horasTdp: semana.horasTdp ?? null,
            horasTi: semana.horasTi ?? null,
          },
        ]),
      );
      const actuales = new Map(
        (
          await tx.contenido_programatico.findMany({
            where: { id_proyecto_docente: id },
          })
        ).map((fila) => [fila.semana, fila]),
      );

      const anterior: Record<number, Fila> = {};
      const nuevo: Record<number, Fila> = {};
      const porCrear: Prisma.contenido_programaticoCreateManyInput[] = [];
      for (let semana = 1; semana <= numeroSemanas; semana++) {
        const deseada = enviadas.get(semana) ?? VACIA;
        const actual = actuales.get(semana);
        if (!actual) {
          if (!esVacia(deseada)) {
            porCrear.push({
              id_proyecto_docente: id,
              semana,
              ...aColumnas(deseada),
            });
            nuevo[semana] = deseada;
          }
          continue;
        }
        const previa = deColumnas(actual);
        if (!iguales(previa, deseada)) {
          await tx.contenido_programatico.update({
            where: { id: actual.id },
            data: aColumnas(deseada),
          });
          anterior[semana] = previa;
          nuevo[semana] = deseada;
        }
      }
      if (porCrear.length > 0) {
        await tx.contenido_programatico.createMany({ data: porCrear });
      }

      const resultado = await this.leerSeccion(tx, id);
      return {
        resultado,
        auditoria: {
          accion: 'actualizar',
          tabla: 'proyecto_docente',
          idRegistro: id,
          anterior: { contenidos: anterior },
          // La comparación con la asignatura es la constancia de la diferencia (p4).
          nuevo: {
            contenidos: nuevo,
            horasCoinciden: resultado.horasCoinciden,
            comparacion: resultado.comparacion.map(
              ({ tipo, contenidos, asignatura, diferencia }) => ({
                tipo,
                contenidos,
                asignatura,
                diferencia,
              }),
            ),
          },
        },
      };
    });
  }

  /** RF-15, p2 y p4: la tabla de semanas del período y la comparación de horas. */
  private async leerSeccion(
    cliente: Tx | PrismaService,
    id: number,
  ): Promise<SeccionContenidosDto> {
    const proyecto = await cliente.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: {
        periodo_academico: { select: { numero_semanas: true } },
        asignatura: {
          select: {
            creditos: true,
            horas_tde: true,
            horas_tdp: true,
            horas_ti: true,
            horas_totales: true,
          },
        },
        contenido_programatico: { orderBy: { semana: 'asc' } },
      },
    });
    const numeroSemanas = proyecto.periodo_academico?.numero_semanas ?? null;
    const porSemana = new Map(
      proyecto.contenido_programatico.map((fila) => [fila.semana, fila]),
    );
    const semanas: SemanaContenidoDto[] = Array.from(
      { length: numeroSemanas ?? 0 },
      (_, indice) => {
        const semana = indice + 1;
        const fila = porSemana.get(semana);
        return {
          semana,
          id: fila?.id ?? null,
          ...(fila ? deColumnas(fila) : VACIA),
        };
      },
    );
    const asignatura = proyecto.asignatura;
    return {
      numeroSemanas,
      semanas,
      semanasSinTema: semanasSinTema({
        numeroSemanas,
        semanasConTema: semanas
          .filter((semana) => semana.tema !== null)
          .map((semana) => semana.semana),
      }),
      ...compararHoras(semanas, asignatura),
      datosAsignaturaFaltantes: camposFaltantes(
        asignatura ?? {
          creditos: null,
          horas_tde: null,
          horas_tdp: null,
          horas_ti: null,
        },
      ),
    };
  }
}
