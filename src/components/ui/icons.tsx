import { Baby, Briefcase, Camera, ClipboardList, GraduationCap, Home, Laptop, Leaf, PartyPopper, PawPrint, Store } from "lucide-react";

const MAP = { GraduationCap, PawPrint, Baby, Leaf, Laptop, Camera, Store, PartyPopper, Home, ClipboardList, Briefcase };

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name as keyof typeof MAP] ?? Briefcase;
  return <Icon className={className} aria-hidden="true" />;
}
