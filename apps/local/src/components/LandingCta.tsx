import Link from "next/link";

/** The one call to action on the landing page: a big white pill on the hero card. Everything starts at Home. */
export function LandingCta() {
  return (
    <Link
      href="/home"
      className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-white px-8 text-lg font-extrabold text-[#5846d6] shadow-md transition-colors hover:bg-white/90 sm:w-auto"
    >
      Get started
    </Link>
  );
}
