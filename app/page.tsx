import { supabase } from "@/lib/supabase";

type Ebook = {
  id: string;
  title: string;
  description: string;
  category: string;
  cover_path: string | null;
  price_cents: number;
  promo_enabled: boolean;
  promo_price_cents: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

function currentPrice(book: Ebook) {
  const now = Date.now();
  const start = book.promo_starts_at ? new Date(book.promo_starts_at).getTime() : 0;
  const end = book.promo_ends_at ? new Date(book.promo_ends_at).getTime() : Infinity;
  if (book.promo_enabled && book.promo_price_cents !== null && now >= start && now < end) {
    return book.promo_price_cents;
  }
  return book.price_cents;
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

async function getBooks(): Promise<Ebook[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ebooks")
    .select("id,title,description,category,cover_path,price_cents,promo_enabled,promo_price_cents,promo_starts_at,promo_ends_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Supabase catalogue error:", error.message);
    return [];
  }
  return (data ?? []) as Ebook[];
}

export default async function Home() {
  const books = await getBooks();

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">ALETHERION</a>
        <a className="toplink" href="#catalogue">Bibliothèque</a>
      </header>

      <section className="hero">
        <video className="hero-video" autoPlay muted loop playsInline poster="/assets/banner-frame.jpg" aria-hidden="true">
          <source src="/assets/banner.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay" aria-hidden="true" />
        <p className="eyebrow">BIBLIOTHÈQUE DE L’ESPRIT</p>
        <h1>La connaissance<br /><em>est une forme de pouvoir.</em></h1>
        <p className="intro">Des œuvres choisies pour ceux qui refusent de penser superficiellement.</p>
        <a className="cta" href="#catalogue">Explorer la bibliothèque <span>↗</span></a>
      </section>

      <section className="visual-gallery" aria-label="Univers visuel ALETHERION">
        <div className="gallery-caption"><p className="eyebrow">L’UNIVERS ALETHERION</p><h2>Le silence.<br/><em>La pensée.</em></h2></div>
        <div className="gallery-images">
          <img src="/assets/Videoframe_20261121_122008_com.huawei.himovie.overseas.webp" alt="Visuel de l’univers ALETHERION" />
          <img src="/assets/Videoframe_20261121_122034_com.huawei.himovie.overseas.webp" alt="Statue et ambiance monochrome" />
          <img src="/assets/Videoframe_20261121_122101_com.huawei.himovie.overseas.webp" alt="Détail visuel de la bannière ALETHERION" />
        </div>
      </section>

      <section className="catalogue" id="catalogue">
        <div className="section-heading">
          <div>
            <p className="eyebrow">COLLECTION</p>
            <h2>Bibliothèque</h2>
          </div>
          <p className="count">{books.length} œuvre{books.length > 1 ? "s" : ""}</p>
        </div>

        {!supabase && <p className="notice">La connexion à Supabase n’est pas encore configurée.</p>}
        {supabase && books.length === 0 && <p className="empty">Aucun ouvrage publié pour le moment. Les prochaines œuvres apparaîtront ici.</p>}

        <div className="grid">
          {books.map((book) => {
            const price = currentPrice(book);
            const isPromo = price < book.price_cents;
            const cover = book.cover_path && supabase
              ? supabase.storage.from("ebook-covers").getPublicUrl(book.cover_path).data.publicUrl
              : null;
            return (
              <article className="book" key={book.id}>
                <div className="cover">
                  {cover ? <img src={cover} alt={`Couverture de ${book.title}`} /> : <div className="cover-placeholder">A</div>}
                  {isPromo && <span className="sale">PROMOTION</span>}
                </div>
                <div className="book-info">
                  <p className="category">{book.category}</p>
                  <h3>{book.title}</h3>
                  <p className="description">{book.description}</p>
                  <div className="prices">
                    <strong>{formatPrice(price)}</strong>
                    {isPromo && <del>{formatPrice(book.price_cents)}</del>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="contact" id="contact">
        <p className="eyebrow">CONTACT & COMMUNAUTÉ</p>
        <h2>Une question ?<br /><em>Entrons en contact.</em></h2>
        <div className="contact-links">
          <a className="contact-link" href="mailto:godsonjosueguenole@gmail.com">✉ Email <span>↗</span></a>
          <a className="contact-link" href="https://wa.me/22899821930" target="_blank" rel="noopener noreferrer">◉ WhatsApp <span>↗</span></a>
          <a className="contact-link" href="https://www.tiktok.com/@aletherion" target="_blank" rel="noopener noreferrer">TikTok <span>↗</span></a>
          <a className="contact-link" href="https://www.youtube.com/@aletherion" target="_blank" rel="noopener noreferrer">YouTube <span>↗</span></a>
        </div>
      </section>

      <footer>
        <span>ALETHERION</span>
        <p>La pensée est le commencement de toute liberté.</p>
      </footer>
    </main>
  );
}
