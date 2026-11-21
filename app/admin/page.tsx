
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Ebook = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  cover_path: string | null;
  pdf_path: string | null;
  price_cents: number;
  is_published: boolean;
  promo_enabled: boolean;
  promo_price_cents: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  created_at?: string;
};

const emptyForm = {
  title: "",
  slug: "",
  description: "",
  category: "",
  price: "",
  promoPrice: "",
  promoStart: "",
  promoEnd: "",
  published: false,
  promoEnabled: false,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
}

function promotionStatus(book: Ebook) {
  if (!book.promo_enabled || !book.promo_price_cents) return "Aucune";
  const now = Date.now();
  const start = book.promo_starts_at
    ? new Date(book.promo_starts_at).getTime()
    : 0;
  const end = book.promo_ends_at
    ? new Date(book.promo_ends_at).getTime()
    : Infinity;

  if (now < start) return "Programmée";
  if (now > end) return "Terminée";
  return "Active";
}

export default function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [books, setBooks] = useState<Ebook[]>([]);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState<Ebook | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        setMessage("Configuration Supabase manquante.");
        setSessionReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (data.session) {
        await verifyAdmin();
      } else {
        setSessionReady(true);
      }
    }

    checkSession();
  }, []);

  async function verifyAdmin() {
    if (!supabase) return;

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setAuthorized(false);
      setSessionReady(true);
      return;
    }

    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    setAuthorized(!error && !!data);
    setSessionReady(true);

    if (data) await loadBooks();
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("Identifiants incorrects ou connexion impossible.");
      setBusy(false);
      return;
    }

    await verifyAdmin();
    setBusy(false);
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthorized(false);
    setBooks([]);
  }

  async function loadBooks() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("ebooks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Erreur de chargement : " + error.message);
      return;
    }

    setBooks((data || []) as Ebook[]);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setCoverFile(null);
    setPdfFile(null);
    setMessage("");
    setTab("ebooks");
  }

  function openEdit(book: Ebook) {
    setEditing(book);
    setForm({
      title: book.title || "",
      slug: book.slug || "",
      description: book.description || "",
      category: book.category || "",
      price: String((book.price_cents || 0) / 100),
      promoPrice: book.promo_price_cents
        ? String(book.promo_price_cents / 100)
        : "",
      promoStart: localDate(book.promo_starts_at),
      promoEnd: localDate(book.promo_ends_at),
      published: book.is_published,
      promoEnabled: book.promo_enabled,
    });
    setCoverFile(null);
    setPdfFile(null);
    setMessage("");
    setTab("ebooks");
  }

  async function uploadFile(file: File, bucket: string) {
    if (!supabase) throw new Error("Supabase indisponible");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${safeName}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;
    return path;
  }

  async function saveBook(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    if (!form.title.trim() || !form.price) {
      setMessage("Le titre et le prix normal sont obligatoires.");
      return;
    }

    const normalPrice = Number(form.price);
    const promoPrice = Number(form.promoPrice);

    if (!Number.isFinite(normalPrice) || normalPrice < 0) {
      setMessage("Prix normal invalide.");
      return;
    }

    if (
      form.promoEnabled &&
      (!form.promoPrice ||
        !Number.isFinite(promoPrice) ||
        promoPrice < 0 ||
        promoPrice >= normalPrice ||
        !form.promoStart ||
        !form.promoEnd ||
        new Date(form.promoEnd) <= new Date(form.promoStart))
    ) {
      setMessage("Vérifie le prix réduit et les dates de promotion.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      let coverPath = editing?.cover_path || null;
      let pdfPath = editing?.pdf_path || null;

      if (coverFile) {
        coverPath = await uploadFile(coverFile, "ebook-covers");
      }

      if (pdfFile) {
        pdfPath = await uploadFile(pdfFile, "ebook-pdfs");
      }

      const record = {
        title: form.title.trim(),
        slug: slugify(form.slug || form.title),
        description: form.description,
        category: form.category,
        cover_path: coverPath,
        pdf_path: pdfPath,
        price_cents: Math.round(normalPrice * 100),
        is_published: form.published,
        promo_enabled: form.promoEnabled,
        promo_price_cents: form.promoEnabled
          ? Math.round(promoPrice * 100)
          : null,
        promo_starts_at: form.promoEnabled
          ? new Date(form.promoStart).toISOString()
          : null,
        promo_ends_at: form.promoEnabled
          ? new Date(form.promoEnd).toISOString()
          : null,
      };

      const result = editing
        ? await supabase
            .from("ebooks")
            .update(record)
            .eq("id", editing.id)
        : await supabase.from("ebooks").insert(record);

      if (result.error) throw result.error;

      setMessage(editing ? "Ebook modifié avec succès." : "Ebook ajouté avec succès.");
      setEditing(null);
      setForm(emptyForm);
      setCoverFile(null);
      setPdfFile(null);
      await loadBooks();
    } catch (err: any) {
      setMessage("Erreur : " + (err?.message || "Opération impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(book: Ebook) {
    if (!supabase) return;

    const { error } = await supabase
      .from("ebooks")
      .update({ is_published: !book.is_published })
      .eq("id", book.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadBooks();
  }

  async function deleteBook(book: Ebook) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Supprimer définitivement « ${book.title} » ?`
    );

    if (!confirmed) return;

    setBusy(true);

    const { error } = await supabase
      .from("ebooks")
      .delete()
      .eq("id", book.id);

    if (error) {
      setMessage("Suppression impossible : " + error.message);
      setBusy(false);
      return;
    }

    const coverPath = book.cover_path;
    const pdfPath = book.pdf_path;

    if (coverPath) {
      await supabase.storage.from("ebook-covers").remove([coverPath]);
    }
    if (pdfPath) {
      await supabase.storage.from("ebook-pdfs").remove([pdfPath]);
    }

    await loadBooks();
    setMessage("Ebook supprimé.");
    setBusy(false);
  }

  async function previewPdf(book: Ebook) {
    if (!supabase || !book.pdf_path) return;

    const { data, error } = await supabase.storage
      .from("ebook-pdfs")
      .createSignedUrl(book.pdf_path, 300);

    if (error || !data?.signedUrl) {
      setMessage("Impossible de créer le lien PDF.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  const filteredBooks = useMemo(
    () =>
      books.filter((book) =>
        `${book.title} ${book.category || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [books, search]
  );

  const published = books.filter((b) => b.is_published).length;
  const promotions = books.filter(
    (b) => promotionStatus(b) === "Active"
  ).length;
  const scheduled = books.filter(
    (b) => promotionStatus(b) === "Programmée"
  ).length;

  if (!sessionReady) {
    return (
      <main className="loading">
        <p>A L E T H E R I O N</p>
        <span>Initialisation du système...</span>
        <style jsx>{`
          .loading {
            min-height: 100vh;
            background: #080808;
            color: white;
            display: grid;
            place-content: center;
            text-align: center;
            font-family: Georgia, serif;
            letter-spacing: 5px;
          }
          span {
            color: #888;
            font: 12px Arial;
            letter-spacing: 1px;
          }
        `}</style>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="login">
        <video autoPlay muted loop playsInline className="video">
          <source src="/assets/1795158256886.mp4" type="video/mp4" />
        </video>
        <div className="shade" />
        <form className="loginCard" onSubmit={login}>
          <div className="symbol">A</div>
          <p className="eyebrow">ALETHERION · PRIVATE ACCESS</p>
          <h1>Administration</h1>
          <p className="sub">Accès réservé aux administrateurs.</p>
          <input
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {message && <p className="message">{message}</p>}
          <button disabled={busy}>
            {busy ? "Connexion..." : "Accéder au dashboard"}
          </button>
          <a href="/">Retour au site</a>
        </form>
        <style jsx>{`
          .login {
            min-height: 100vh;
            background: #080808;
            color: white;
            display: grid;
            place-items: center;
            position: relative;
            overflow: hidden;
            padding: 20px;
            font-family: Arial, sans-serif;
          }
          .video,
          .shade {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
          }
          .video {
            object-fit: cover;
            opacity: 0.38;
          }
          .shade {
            background: linear-gradient(90deg, #050505d9, #05050599);
          }
          .loginCard {
            position: relative;
            width: min(100%, 410px);
            padding: 38px 28px;
            background: #111111d9;
            border: 1px solid #ffffff22;
            backdrop-filter: blur(15px);
            text-align: center;
            border-radius: 3px;
            animation: appear 0.8s ease;
          }
          .symbol {
            font: 54px Georgia;
            color: #d7c7a0;
          }
          .eyebrow {
            color: #b9a77d;
            font-size: 10px;
            letter-spacing: 3px;
          }
          h1 {
            font: 32px Georgia;
            margin: 15px 0 8px;
          }
          .sub {
            color: #999;
            font-size: 13px;
            margin-bottom: 28px;
          }
          input {
            width: 100%;
            padding: 15px;
            margin: 7px 0;
            background: #080808;
            color: white;
            border: 1px solid #333;
            outline: none;
          }
          input:focus {
            border-color: #b9a77d;
          }
          button {
            width: 100%;
            padding: 15px;
            margin-top: 15px;
            background: #c9b98f;
            color: #111;
            border: 0;
            cursor: pointer;
            font-weight: bold;
          }
          a {
            display: block;
            color: #999;
            margin-top: 24px;
            font-size: 12px;
          }
          .message {
            color: #e3a0a0;
            font-size: 12px;
          }
          @keyframes appear {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="admin">
      <header className="topbar">
        <a href="/" className="brand">A L E T H E R I O N</a>
        <div className="topActions">
          <span>ADMINISTRATEUR</span>
          <button onClick={logout}>Déconnexion</button>
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">CONTROL CENTER · 01</p>
        <h1>Le pouvoir de gérer.</h1>
        <p>Bibliothèque, publications et campagnes promotionnelles.</p>
      </section>

      <nav className="tabs">
        {[
          ["overview", "Vue générale"],
          ["ebooks", "Bibliothèque"],
          ["promotions", "Promotions"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {message && <div className="notice">{message}</div>}

      {tab === "overview" && (
        <>
          <section className="stats">
            <article><span>TOUS LES EBOOKS</span><strong>{books.length}</strong></article>
            <article><span>EN LIGNE</span><strong>{published}</strong></article>
            <article><span>PROMOTIONS ACTIVES</span><strong>{promotions}</strong></article>
            <article><span>PROGRAMMÉES</span><strong>{scheduled}</strong></article>
          </section>
          <section className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">ACTIVITÉ RÉCENTE</p>
                <h2>Derniers ebooks</h2>
              </div>
              <button className="gold" onClick={openNew}>+ Ajouter un ebook</button>
            </div>
            {books.slice(0, 5).map((book) => (
              <div className="bookRow" key={book.id}>
                <div>
                  <strong>{book.title}</strong>
                  <small>{book.category || "Sans catégorie"}</small>
                </div>
                <span>{book.is_published ? "Publié" : "Brouillon"}</span>
                <button onClick={() => openEdit(book)}>Modifier</button>
              </div>
            ))}
            {books.length === 0 && <p className="muted">Aucun ebook pour le moment.</p>}
          </section>
        </>
      )}

      {tab === "ebooks" && (
        <section className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">COLLECTION PRIVÉE</p>
              <h2>{editing ? "Modifier l'ebook" : "Bibliothèque"}</h2>
            </div>
            {!editing && <button className="gold" onClick={openNew}>+ Nouvel ebook</button>}
          </div>

          {(editing || form.title !== "" || books.length === 0) && (
            <form className="editor" onSubmit={saveBook}>
              <h3>{editing ? "Édition du contenu" : "Créer un ebook"}</h3>
              <label>Titre de l'ebook</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Titre"
              />
              <label>Identifiant URL (slug)</label>
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Généré automatiquement si vide"
              />
              <label>Catégorie</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Philosophie, développement personnel..."
              />
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="Présente cet ebook..."
              />

              <div className="two">
                <div>
                  <label>Prix normal</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="Ex. 2500"
                    required
                  />
                </div>
                <div>
                  <label>Prix promotionnel</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.promoPrice}
                    onChange={(e) => setForm({ ...form, promoPrice: e.target.value })}
                    placeholder="Ex. 1500"
                  />
                </div>
              </div>

              <label>Couverture (image)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
              <label>Fichier ebook (PDF)</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />

              <div className="check">
                <label>
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  />
                  Publier cet ebook
                </label>
              </div>

              <div className="check">
                <label>
                  <input
                    type="checkbox"
                    checked={form.promoEnabled}
                    onChange={(e) => setForm({ ...form, promoEnabled: e.target.checked })}
                  />
                  Activer une promotion programmée
                </label>
              </div>

              {form.promoEnabled && (
                <div className="two">
                  <div>
                    <label>Début de la promotion</label>
                    <input
                      type="datetime-local"
                      value={form.promoStart}
                      onChange={(e) => setForm({ ...form, promoStart: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>Fin de la promotion</label>
                    <input
                      type="datetime-local"
                      value={form.promoEnd}
                      onChange={(e) => setForm({ ...form, promoEnd: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="formActions">
                <button className="gold" disabled={busy}>
                  {busy ? "Enregistrement..." : editing ? "Enregistrer les modifications" : "Créer l'ebook"}
                </button>
                <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>
                  Annuler
                </button>
              </div>
            </form>
          )}

          <div className="search">
            <input
              placeholder="Rechercher un ebook..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredBooks.map((book) => {
            const cover = book.cover_path
              ? supabase?.storage.from("ebook-covers").getPublicUrl(book.cover_path).data.publicUrl
              : null;

            return (
              <div className="bookRow libraryRow" key={book.id}>
                {cover && <img src={cover} alt="" />}
                <div className="bookInfo">
                  <strong>{book.title}</strong>
                  <small>{book.category || "Sans catégorie"} · {book.is_published ? "Publié" : "Brouillon"}</small>
                  <small>Promotion : {promotionStatus(book)}</small>
                </div>
                <div className="rowActions">
                  <button onClick={() => openEdit(book)}>Modifier</button>
                  <button onClick={() => togglePublish(book)}>
                    {book.is_published ? "Masquer" : "Publier"}
                  </button>
                  {book.pdf_path && <button onClick={() => previewPdf(book)}>PDF</button>}
                  <button className="danger" onClick={() => deleteBook(book)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === "promotions" && (
        <section className="panel">
          <p className="eyebrow">CAMPAGNES COMMERCIALES</p>
          <h2>Gestion des promotions</h2>
          <p className="muted">
            Le prix réduit s'applique uniquement entre les dates de début et de fin.
            Après expiration, le prix normal doit être affiché automatiquement sur le site.
          </p>
          {books.filter((b) => b.promo_enabled).map((book) => (
            <div className="bookRow" key={book.id}>
              <div>
                <strong>{book.title}</strong>
                <small>
                  {book.promo_starts_at ? new Date(book.promo_starts_at).toLocaleString() : "Début non défini"}
                  {" → "}
                  {book.promo_ends_at ? new Date(book.promo_ends_at).toLocaleString() : "Fin non définie"}
                </small>
              </div>
              <span>{promotionStatus(book)}</span>
              <button onClick={() => openEdit(book)}>Modifier</button>
            </div>
          ))}
          {books.every((b) => !b.promo_enabled) && (
            <p className="muted">Aucune campagne promotionnelle configurée.</p>
          )}
        </section>
      )}

      <footer>© ALETHERION · ADMIN CONTROL CENTER</footer>

      <style jsx>{`
        .admin {
          min-height: 100vh;
          background: #090909;
          color: #eee;
          padding: 0 5vw 60px;
          font-family: Arial, sans-serif;
          position: relative;
        }
        .admin:before {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(#080808ed, #080808f5), url("/assets/1795158256886.mp4");
          pointer-events: none;
          z-index: 0;
        }
        .admin > * {
          position: relative;
          z-index: 1;
        }
        .topbar {
          min-height: 75px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #ffffff18;
          gap: 15px;
        }
        .brand {
          color: #d7c7a0;
          font: 15px Georgia;
          letter-spacing: 3px;
          text-decoration: none;
        }
        .topActions {
          display: flex;
          align-items: center;
          gap: 15px;
          font-size: 9px;
          letter-spacing: 2px;
          color: #aaa;
        }
        button {
          cursor: pointer;
          border: 1px solid #444;
          background: transparent;
          color: #ddd;
          padding: 10px 14px;
          font-size: 11px;
        }
        button:hover {
          border-color: #c9b98f;
          color: #e0d0a8;
        }
        button:disabled {
          opacity: .5;
          cursor: wait;
        }
        .intro {
          padding: 55px 0 35px;
        }
        .eyebrow {
          color: #bca97e;
          letter-spacing: 3px;
          font-size: 9px;
        }
        h1, h2, h3 {
          font-family: Georgia, serif;
          font-weight: 400;
        }
        h1 {
          font-size: clamp(32px, 6vw, 55px);
          margin: 12px 0;
        }
        .intro > p:last-child, .muted {
          color: #888;
          font-size: 13px;
          line-height: 1.7;
        }
        .tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #ffffff20;
          overflow-x: auto;
          margin-bottom: 25px;
        }
        .tabs button {
          border: 0;
          border-bottom: 2px solid transparent;
          padding: 15px 12px;
          white-space: nowrap;
        }
        .tabs button.active {
          color: #d7c7a0;
          border-bottom-color: #c9b98f;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin: 25px 0;
        }
        .stats article, .panel {
          background: #111111e8;
          border: 1px solid #ffffff17;
          padding: 22px;
        }
        .stats span {
          display: block;
          color: #999;
          font-size: 9px;
          letter-spacing: 1.5px;
        }
        .stats strong {
          display: block;
          font: 35px Georgia;
          color: #d7c7a0;
          margin-top: 15px;
        }
        .panel {
          margin-top: 20px;
        }
        .panelHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 20px;
        }
        h2 {
          font-size: 26px;
          margin: 8px 0;
        }
        .gold {
          background: #c9b98f;
          color: #111;
          border-color: #c9b98f;
          font-weight: bold;
        }
        .notice {
          padding: 13px;
          margin: 15px 0;
          color: #d7c7a0;
          background: #c9b98f14;
          border: 1px solid #c9b98f55;
          font-size: 12px;
        }
        .bookRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px 0;
          border-top: 1px solid #ffffff15;
        }
        .bookRow strong, .bookRow small {
          display: block;
        }
        .bookRow strong {
          font: 16px Georgia;
        }
        .bookRow small {
          color: #888;
          margin-top: 6px;
          font-size: 10px;
        }
        .bookRow > span {
          color: #c9b98f;
          font-size: 10px;
        }
        .editor {
          border: 1px solid #ffffff20;
          padding: 20px;
          margin: 20px 0;
          background: #090909;
        }
        .editor h3 {
          font-size: 22px;
          margin: 0 0 22px;
        }
        .editor label {
          display: block;
          font-size: 11px;
          color: #bca97e;
          margin: 15px 0 7px;
        }
        .editor input:not([type="checkbox"]), .editor textarea, .search input {
          width: 100%;
          background: #151515;
          border: 1px solid #383838;
          color: white;
          padding: 13px;
          outline: none;
          box-sizing: border-box;
          font: 13px Arial;
        }
        .editor input:focus, .editor textarea:focus {
          border-color: #bca97e;
        }
        .editor input[type="file"] {
          font-size: 11px;
        }
        .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .check label {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ddd;
        }
        .formActions, .rowActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
        }
        .search {
          margin: 20px 0;
        }
        .libraryRow {
          align-items: center;
        }
        .libraryRow img {
          width: 55px;
          height: 70px;
          object-fit: cover;
          background: #222;
        }
        .bookInfo {
          flex: 1;
          min-width: 100px;
        }
        .rowActions {
          margin: 0;
          justify-content: flex-end;
        }
        .danger {
          color: #d88b8b;
          border-color: #713d3d;
        }
        footer {
          text-align: center;
          color: #555;
          font-size: 9px;
          letter-spacing: 3px;
          padding: 55px 0 10px;
        }
        @media(max-width: 700px) {
          .stats {
            grid-template-columns: 1fr 1fr;
          }
          .stats article {
            padding: 16px;
          }
          .stats strong {
            font-size: 28px;
          }
          .panel {
            padding: 15px;
          }
          .panelHead {
            align-items: flex-start;
            flex-direction: column;
          }
          .bookRow {
            flex-wrap: wrap;
          }
          .rowActions {
            width: 100%;
            justify-content: flex-start;
          }
          .two {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .topActions span {
            display: none;
          }
          .brand {
            font-size: 11px;
          }
        }
      `}</style>
    </main>
  );
}
