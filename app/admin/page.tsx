
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");

  async function checkAdmin() {
    if (!supabase) {
      setError("Configuration Supabase manquante.");
      setLoading(false);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (user) {
      const { data: admin } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      setIsAdmin(!!admin);
    }

    setLoading(false);
  }

  useEffect(() => {
    checkAdmin();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setError("");

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setError("Identifiants incorrects.");
      setBusy(false);
      return;
    }

    const { data: admin, error: adminError } =
      await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

    if (adminError || !admin) {
      await supabase.auth.signOut();
      setError("Accès administrateur non autorisé.");
      setBusy(false);
      return;
    }

    setIsAdmin(true);
    setPassword("");
    setBusy(false);
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsAdmin(false);
  }

  return (
    <main className="min-h-screen bg-[#090909] text-white flex items-center justify-center p-5">
      <div className="w-full max-w-md border border-white/10 bg-[#111] p-8 rounded-2xl">
        <p className="text-xs tracking-[0.4em] text-white/40 mb-4">
          ALETHERION
        </p>

        <h1 className="text-3xl font-serif mb-2">
          Administration
        </h1>

        <p className="text-sm text-white/50 mb-8">
          Espace réservé aux administrateurs.
        </p>

        {loading ? (
          <p className="text-white/50">Vérification...</p>
        ) : isAdmin ? (
          <div>
            <p className="text-green-400 mb-6">
              Accès administrateur autorisé.
            </p>
            <p className="text-white/60 text-sm mb-6">
              Bienvenue dans ALETHERION.
              Le tableau de bord sera ajouté ici.
            </p>
            <button
              onClick={handleLogout}
              className="w-full border border-white/20 rounded-lg p-3 hover:bg-white/10"
            >
              Déconnexion
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder="Adresse e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-black border border-white/15 rounded-lg p-3 outline-none"
            />

            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-black border border-white/15 rounded-lg p-3 outline-none"
            />

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-white text-black rounded-lg p-3 font-semibold disabled:opacity-50"
            >
              {busy ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
