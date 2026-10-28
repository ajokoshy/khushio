import { Baby, BookOpen, Dumbbell, Home, Plane, Shirt, Smartphone, Sparkles } from "lucide-react";
import { categories, features } from "@/lib/config/site";

const icons = { Shirt, Smartphone, Sparkles, Home, Baby, Dumbbell, Plane, BookOpen };

export function CategoryStrip() {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
      {categories.map((c) => {
        const Icon = icons[c.icon];
        const inner = (
          <>
            <span className={`flex h-14 w-14 items-center justify-center rounded-full ${c.tone}`}><Icon size={24} aria-hidden /></span>
            <span className="text-center text-sm font-medium text-forest">{c.label}</span>
          </>
        );
        return (
          <li key={c.slug}>
            {features.categories
              ? <a href={`/categories/${c.slug}`} className="flex flex-col items-center gap-2 hover:opacity-80">{inner}</a>
              : <div className="flex flex-col items-center gap-2">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
