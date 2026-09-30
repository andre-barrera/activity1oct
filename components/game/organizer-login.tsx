"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function OrganizerLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data, error: signInError } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError || !data.session) {
        throw new Error(signInError?.message || "No se pudo iniciar sesión.");
      }
      onAuthenticated();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo iniciar sesión.";
      setError(message.toLowerCase().includes("invalid login credentials")
        ? "El correo o la contraseña no son correctos."
        : message);
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit}>
    <span className="eyebrow"><KeyRound /> ACCESO DEL ORGANIZADOR</span>
    <h2>SOLO TÚ<br /><em>CONTROLAS.</em></h2>
    <p className="form-hint">Inicia sesión con la cuenta autorizada en Supabase.</p>
    <label htmlFor="organizer-email">Correo electrónico</label>
    <input id="organizer-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
    <label htmlFor="organizer-password">Contraseña</label>
    <input id="organizer-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button className="action lime" type="submit" disabled={busy}>
      {busy ? <LoaderCircle className="spin" /> : <LogIn />}
      {busy ? "Verificando…" : "Iniciar sesión"}
    </Button>
    <p className="form-hint">La cuenta se crea una sola vez desde Supabase Authentication.</p>
  </form>;
}
