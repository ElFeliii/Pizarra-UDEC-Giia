import {
  LIMITS,
  OTHER_INSTITUTION_ID,
  firstIssue,
  sessionInputSchema,
  type Institution,
} from '@pizarra/shared';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../api/http';
import { useStore } from '../state/store';
import { InstitutionPicker } from './InstitutionPicker';

/**
 * Aviso de datos. Va en la hoja de registro y también en el menú, porque ahora se puede usar
 * la página entera sin registrarse y nadie debería quedarse sin verlo.
 */
export function AvisoDatos({ abierto = false }: { abierto?: boolean }) {
  return (
    <details className="entry__datos" open={abierto}>
      <summary>Qué datos se guardan</summary>
      <p>
        Se guarda lo que escribas junto a tu nombre y tu institución, y la dirección IP desde la que
        entras. La IP no se muestra a nadie: sirve para frenar el spam y solo la ve el equipo
        organizador. Mientras miras, el navegador guarda un identificador aleatorio para contar una
        sola vez las notas que abres; no dice quién eres ni se comparte con nadie. No se usan
        cookies de seguimiento. Los mensajes quedan en el servidor de la Universidad después del
        evento; si quieres que se borre algo tuyo, pídeselo al equipo organizador.
      </p>
    </details>
  );
}

export function Entrada() {
  const setSession = useStore((s) => s.setSession);
  const registro = useStore((s) => s.registro);
  const cerrarRegistro = useStore((s) => s.cerrarRegistro);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .institutions()
      .then(setInstitutions)
      .catch(() => setError('No se pudo cargar la lista de instituciones. Recarga la página.'));
  }, []);

  const isOther = institution?.id === OTHER_INSTITUTION_ID;
  const input = {
    name,
    institutionId: institution?.id ?? '',
    institutionOther: isOther ? other : undefined,
  };
  const check = sessionInputSchema.safeParse(input);
  const clientError = check.success ? null : firstIssue(check.error);

  async function submit() {
    setTouched(true);
    if (!check.success || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.createSession(check.data);
      setSession(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo ingresar. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  if (!registro) return null;

  return (
    <div className="entry entry--hoja" role="dialog" aria-modal="true" aria-label="Entrar">
      <button type="button" className="entry__fondo" aria-label="Cerrar" onClick={cerrarRegistro} />
      <form
        className="entry__card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="entry__brand" aria-hidden="true">
          <span className="entry__pin entry__pin--a" />
          <span className="entry__pin entry__pin--b" />
          <span className="entry__pin entry__pin--c" />
        </div>
        <h1 className="entry__title">Pizarra UdeC</h1>
        <p className="entry__lead">{registro.motivo}</p>

        <label className="field">
          <span className="field__label">Tu nombre</span>
          <input
            className={`input${touched && name.trim().length < LIMITS.name.min ? ' input--invalid' : ''}`}
            autoComplete="given-name"
            maxLength={LIMITS.name.max}
            placeholder="Ej: Camila"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">Colegio o universidad</span>
          <InstitutionPicker
            items={institutions}
            value={institution}
            onChange={setInstitution}
            invalid={touched && !institution}
          />
        </div>

        {isOther && (
          <label className="field">
            <span className="field__label">Nombre de tu institución</span>
            <input
              className={`input${touched && other.trim().length < LIMITS.institutionOther.min ? ' input--invalid' : ''}`}
              maxLength={LIMITS.institutionOther.max}
              placeholder="Escribe el nombre"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              autoFocus
            />
          </label>
        )}

        {(error || (touched && clientError)) && (
          <p className="notice notice--error" role="alert">
            {error ?? clientError}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={sending}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="entry__fine">
          Tu nombre e institución se mostrarán junto a lo que publiques. Los mensajes ofensivos se
          bloquean y pueden ser revisados por moderadores.
        </p>
        <AvisoDatos />
      </form>
    </div>
  );
}
