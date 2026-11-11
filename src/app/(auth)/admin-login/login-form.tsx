"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/core/auth/validation";
import { loginAction } from "./actions";

const field =
  "mt-1 block w-full rounded-xl border border-cream-200 bg-cream-50 px-3 py-2 text-forest-800 placeholder:text-ink-600/60";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await loginAction(values, callbackUrl);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" type="email" autoComplete="username" className={field} aria-invalid={!!errors.email} {...register("email")} />
        {errors.email && <p role="alert" className="mt-1 text-sm text-coral-600">Enter a valid email address.</p>}
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input id="password" type="password" autoComplete="current-password" className={field} aria-invalid={!!errors.password} {...register("password")} />
        {errors.password && <p role="alert" className="mt-1 text-sm text-coral-600">Enter your password.</p>}
      </div>
      {formError && <p role="alert" className="rounded-xl bg-coral-100 px-3 py-2 text-sm text-coral-600">{formError}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-forest-800 px-4 py-2.5 font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
