import { Logo } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Menu } from "lucide-react";

export function MobileDrawer() {
  return (
    <Drawer>
      <DrawerTrigger aria-label="메뉴 열기">
        <Menu className="h-6 w-6" aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="px-6">
          <Link
            href="/"
            title="brand-logo"
            className="relative mr-6 flex items-center space-x-2"
          >
            <Logo className="w-auto h-[40px] text-primary" />
            <DrawerTitle>{siteConfig.name}</DrawerTitle>
          </Link>
          <DrawerDescription>{siteConfig.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "default" }),
              "text-primary-foreground rounded-full group"
            )}
          >
            {siteConfig.cta}
          </Link>
          <Link
            href="/why-not-bot"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "rounded-full group"
            )}
          >
            Why Not Bot?
          </Link>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
