import { SetMetadata } from '@nestjs/common';

/**
 * Marca que un endpoint protegido declaró explícitamente quién puede usarlo. El guard global
 * niega cualquier endpoint protegido que no la tenga: un endpoint sin declaración es un bug
 * (CLAUDE.md, «Autorización en el backend, siempre»).
 *
 * Todo decorador de autorización la debe poner: `@Permiso()` y `@Roles()` usan
 * `declararAcceso()`.
 */
export const ACCESO_DECLARADO = 'urap:acceso-declarado';

export const declararAcceso = () => SetMetadata(ACCESO_DECLARADO, true);

/**
 * Endpoint protegido abierto a cualquier usuario con sesión válida, sin importar sus roles:
 * por ejemplo, consultar o cerrar la propia sesión. Es una decisión explícita, no un olvido.
 */
export const CualquierUsuarioAutenticado = declararAcceso;
