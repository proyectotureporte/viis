import { router } from 'expo-router';
import type { NuevoCasoResponse } from '@/lib/movil/contract-empresa';
import { useAction } from '@/services/hooks';
import { Notice, T } from '@/ui/kit';
import { useEmpresa } from '@/ui/empresa/context';
import { useLoad } from '@/ui/empresa/hooks';
import { routes } from '@/ui/empresa/nav';
import { PersonCaseForm } from '@/ui/empresa/PersonCaseForm';
import { Loadable, Page } from '@/ui/empresa/ui';

/** Alta de cliente + caso con autorizaciones y declaración del asesor. */
export default function NuevoCaso() {
  const q = useLoad<NuevoCasoResponse>('/empresa/casos/nuevo');
  const action = useAction();
  const { refreshMenu } = useEmpresa();
  return (
    <Page>
      <Loadable q={q}>
        {(d) =>
          d.allowed ? (
            <>
              <T v="muted" style={{ marginBottom: 16 }}>Registra al cliente y su caso. Si el documento ya existe, el servidor lo detecta sin mostrar datos de otra persona.</T>
              <PersonCaseForm
                options={d.options}
                lockAssigneeToSelf={d.lockAssigneeToSelf}
                declaration={d.declaration}
                consentVersion={d.consentVersion}
                submitLabel="Crear caso"
                pending={action.pending}
                onSubmit={async (body) => {
                  const res = await action.run('/empresa/casos/nuevo', body);
                  const id = typeof res.id === 'string' ? res.id : null;
                  if (res.ok && id) {
                    void refreshMenu(true);
                    router.replace(routes.caso(id));
                  }
                  return res;
                }}
              />
            </>
          ) : (
            <Notice tone="bad">Tu rol no puede registrar personas nuevas. Pide a coordinación que cree el caso.</Notice>
          )
        }
      </Loadable>
    </Page>
  );
}
