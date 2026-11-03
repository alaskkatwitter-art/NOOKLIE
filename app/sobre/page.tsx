import Link from "next/link";
import { Cloud, HeartHandshake, BookOpen, Sparkles } from "lucide-react";
export const metadata = { title: "Sobre o Nooklie | Nooklie" };
export default function Page() {
  return (
    <main className="info-page min-h-screen px-5 py-12 text-white">
      <article className="mx-auto max-w-3xl">
        <header className="info-hero">
          <Cloud size={48} className="text-[#ff9bca]" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[.22em] text-[#ff9bca]">
            De fã para fã
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">
            Um cantinho para chamar de nosso.
          </h1>
          <p className="mt-5 text-lg leading-8 text-white/70">
            Leitura, escrita e acolhimento. Conheça a história do Nooklie.
          </p>
        </header>
        <div className="mt-8 rounded-3xl border border-[#ff9bca]/25 bg-[#ff9bca]/[.07] p-6 sm:p-8">
          <HeartHandshake className="mb-4 text-[#ff9bca]" />
          <h2 className="text-xl font-bold">
            Uma equipe pequena. Um carinho enorme.
          </h2>
          <p className="mt-3 leading-8 text-white/80">
            Somos uma equipe reduzida, formada inteiramente por voluntários.
            Somos fãs, leitores e escritores que também queriam encontrar um
            espaço onde fossem acolhidos. Construímos e cuidamos do Nooklie
            juntos, com o tempo e os recursos que temos, para dividir esse
            cantinho com você.
          </p>
        </div>
        <section className="mt-10 space-y-6 text-base leading-8 text-white/80">
          <BookOpen className="text-[#ff9bca]" />
          <h2 className="text-2xl font-bold text-white">Como tudo começou</h2>
          <p>
            O Nooklie nasceu da vontade de criar um refúgio de leitura e escrita
            totalmente feito de fã para fã. A ideia principal sempre foi
            construir um espaço acolhedor, leve e gratuito, onde leitores e
            autores pudessem se conectar sem barreiras, compartilhando a paixão
            por histórias e universos fantásticos.
          </p>
          <p>
            O próprio nome reflete exatamente essa proposta. Ele vem do conceito
            de nook (aquele cantinho aconchegante onde a gente se senta para ler
            sem ver o tempo passar) combinado com o sufixo -lie, que traz um
            toque carinhoso e faz uma alusão sutil à própria arte da ficção.
            Cada detalhe da plataforma foi pensado para transmitir essa sensação
            de conforto, como uma nuvem onde você pode pousar para ler com
            calma, interagir com a comunidade e acompanhar novos capítulos.
          </p>
          <p>
            Minha intenção com o Nooklie é que ele seja mais do que um simples
            site de publicação. Espero que aqui você encontre um porto seguro
            para dar vida às suas ideias, descobrir narrativas inesquecíveis,
            deixar seus comentários e fazer parte de um cantinho feito com muito
            carinho para quem ama o universo das fanfics.
          </p>
          <p className="rounded-3xl bg-gradient-to-r from-[#ff78b9]/15 to-[#ad83d8]/10 p-6 text-lg font-semibold text-[#ffd1e7]">
            <Sparkles className="mb-3" />
            Ajeite a postura, escolha sua próxima história e sinta-se em casa.
          </p>
        </section>
        <nav
          aria-label="Informações da plataforma"
          className="mt-10 flex flex-wrap gap-3 border-t border-white/10 pt-6"
        >
          {[
            ["/sobre", "Sobre"],
            ["/termos", "Termos"],
            ["/privacidade", "Privacidade"],
            ["/politicas", "Políticas da comunidade"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="min-h-11 rounded-xl border border-white/15 px-4 py-3 text-[#ff9bca] hover:bg-white/5"
            >
              {label}
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}
