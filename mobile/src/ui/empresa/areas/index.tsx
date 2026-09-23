import type { AreaKey } from '@/lib/movil/contract-empresa';
import { AliadosArea } from './Aliados';
import { AnaliticaArea } from './Analitica';
import { AuditoriaArea } from './Auditoria';
import { BandejaArea } from './Bandeja';
import { CatalogosArea } from './Catalogos';
import { ClientesArea } from './Clientes';
import { ComisionesArea } from './Comisiones';
import { DocumentosArea } from './Documentos';
import { LeadsArea } from './Leads';
import { OperacionArea } from './Operacion';
import { PagosArea } from './Pagos';
import { SolicitudesArea } from './Solicitudes';
import type { AreaProps } from './types';
import { UsuariosArea } from './Usuarios';

/** Componente de cada área de la consola (se usa como pestaña o como pantalla de la pila). */
export const AREA_SCREENS: Record<AreaKey, (props: AreaProps) => React.ReactNode> = {
  operacion: () => <OperacionArea />,
  bandeja: ({ tab }) => <BandejaArea tab={tab} />,
  leads: LeadsArea,
  clientes: ClientesArea,
  documentos: DocumentosArea,
  pagos: PagosArea,
  solicitudes: SolicitudesArea,
  aliados: AliadosArea,
  comisiones: ComisionesArea,
  analitica: AnaliticaArea,
  auditoria: AuditoriaArea,
  catalogos: CatalogosArea,
  usuarios: UsuariosArea,
};
