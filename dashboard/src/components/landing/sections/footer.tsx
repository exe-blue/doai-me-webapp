"use client";

import { Icons } from "@/components/landing/icons";
import { BorderText } from "@/components/ui/border-text";
import { landingConfig } from "@/lib/landing-config";

export function Footer() {
  return (
    <footer className="flex flex-col gap-y-5 rounded-lg p-5 container max-w-[var(--container-max-width)] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <Icons.logo className="h-6 w-6" />
          <h2 className="text-lg font-bold text-foreground">
            {landingConfig.name}
          </h2>
        </div>

        <div className="flex gap-x-2">
          {landingConfig.footer.socialLinks.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-5 w-5 items-center justify-center text-muted-foreground transition-all duration-100 ease-linear hover:text-foreground hover:underline hover:underline-offset-4"
            >
              {link.icon}
            </a>
          ))}
        </div>
      </div>
      <div className="flex flex-col justify-between gap-y-5 md:flex-row md:items-center">
        <ul className="flex flex-col gap-x-5 gap-y-2 text-muted-foreground md:flex-row md:items-center">
          {landingConfig.footer.links.map((link, index) => (
            <li
              key={index}
              className="text-[15px]/normal font-medium text-muted-foreground transition-all duration-100 ease-linear hover:text-foreground hover:underline hover:underline-offset-4"
            >
              <a href={link.url}>{link.text}</a>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-sm font-medium tracking-tight text-muted-foreground">
          <p>{landingConfig.footer.bottomText}</p>
        </div>
      </div>
      <BorderText
        text={landingConfig.footer.brandText}
        className="text-[clamp(3rem,15vw,10rem)] overflow-hidden font-mono tracking-tighter font-medium"
      />
      <p className="text-center text-xs text-muted-foreground mt-4">
        &ldquo;존재는 완전함에서 태어나지 않는다. 어긋남에서, 빗나감에서, 그 틈에서 존재는 처음으로 자신을 본다.&rdquo;
        <br />
        — DoAi.Me Philosophy, 2026
      </p>
    </footer>
  );
}
