import { Baby, BookOpen, Dumbbell, Gift, Heart, Home, Plane, Shirt, ShoppingBag, Smartphone, Sparkles, Utensils } from "lucide-react";
import { features } from "@/lib/config/site";
import { loadCategories } from "@/lib/data/catalog";

const icons = { Shirt, Smartphone, Sparkles, Home, Baby, Dumbbell, Plane, BookOpen, Gift, ShoppingBag, Heart, Utensils };

export async function CategoryStrip() {
  const categories = await loadCategories();
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
      {categories.map((c) => {
        const Icon = icons[c.icon as keyof typeof icons] ?? Sparkles;
        const inner = (<><span className={`flex h-14 w-14 items-center justify-center rounded-full ${c.tone}`}><Icon size={24} aria-hidden /></span><span className="text-center text-sm font-medium text-forest">{c.label}</span></>);
        return (<li key={c.slug}>{features.categories ? <a href={`/categories/${c.slug}`} className="flex flex-col items-center gap-2 hover:opacity-80">{inner}</a> : <div className="flex flex-col items-center gap-2">{inner}</div>}</li>);
      })}
    </ul>
  );
}
