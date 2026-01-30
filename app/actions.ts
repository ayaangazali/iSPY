"use server";

import { redirect } from "next/navigation";

export const signUpAction = async (formData: FormData) => {
  // For demo - just redirect to dashboard
  return redirect("/pages/dashboard");
};

export const signInAction = async (formData: FormData) => {
  // For demo - just redirect to dashboard
  return redirect("/pages/dashboard");
};

export const forgotPasswordAction = async (formData: FormData) => {
  return redirect("/sign-in");
};

export const resetPasswordAction = async (formData: FormData) => {
  return redirect("/sign-in");
};

export const signOutAction = async () => {
  return redirect("/");
};
