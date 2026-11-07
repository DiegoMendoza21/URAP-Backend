/** Contenido del JWT (NFR-003). El `jti` enlaza el token con su fila en la tabla `sesion`. */
export interface CargaToken {
  /** Identificador del usuario. */
  sub: number;
  /** Roles activos al iniciar sesión, para el cliente. La autorización usa los vigentes en la base. */
  roles: string[];
  jti: string;
}

/**
 * Usuario que el guard deja en la petición tras validar el token y su sesión. Trae los
 * datos que ya cargó al validar, para que los controladores no los vuelvan a consultar.
 */
export interface UsuarioSesion {
  id: number;
  nombres: string | null;
  apellidos: string | null;
  correo: string;
  /** Roles vigentes en la base al momento de la petición, no los del token. */
  roles: string[];
  jti: string;
  /** Fila de `sesion` del token: la usan el cierre de sesión y la auditoría. */
  idSesion: number;
}

/** Datos de la petición que se guardan con la sesión. */
export interface OrigenPeticion {
  ip?: string;
  userAgent?: string;
}
