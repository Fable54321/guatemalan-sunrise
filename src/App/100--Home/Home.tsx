import { Link } from "react-router-dom";

const Home = () => (
  <main className="relative min-h-screen flex flex-col items-center overflow-hidden bg-[#f3f6ef] px-5 py-10 text-[#24351e] sm:px-8">
    <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#dceabd]/70 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-[#e8efd9] blur-3xl" />

    <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center">
      <header className="flex flex-col items-center gap-3">
        <h1 className="text-7xl font-semibold text-shadow-lg">Recrutement</h1>
      </header>

      <section className=" grid items-center gap-10 py-14  lg:gap-16 max-w-[20rem]">
        <div className="space-y-4">
          <Link
            to="/interviews/new"
            className="group  block rounded-[1.75rem] border border-[#587e1d] bg-[#5d861b] p-6 text-white shadow-[0_24px_60px_rgba(67,101,20,0.60)] transition hover:-translate-y-1 hover:bg-[#527818] sm:p-8"
          >
            <span className="mb-8 grid h-12 w-12 place-items-center rounded-2xl bg-white/15 transition group-hover:bg-white/20">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>

            <span className="mt-2 flex items-end justify-between gap-4">
              <span className="text-2xl font-black tracking-tight sm:text-4xl">
                Commencer une entrevue
              </span>
              <span className="text-2xl transition-transform group-hover:translate-x-1">
                →
              </span>
            </span>
          </Link>

          <div className="rounded-[1.75rem] border border-[#dbe5d4] bg-white/75 p-6 text-[#35482e] shadow-[0_14px_40px_rgba(43,70,28,0.60)] backdrop-blur sm:p-8">
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#edf3e7] text-[#668f20]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M4 16.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.5M12 4v11m0-11 4 4m-4-4L8 8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <span className="mt-2 block text-xl font-black tracking-tight sm:text-4xl">
              Téléverser les photos des candidats
            </span>
          </div>
        </div>
      </section>
    </div>
  </main>
);

export default Home;
