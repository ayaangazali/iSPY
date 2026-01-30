import Link from "next/link";

export default function AuthButton() {
  return (
    <div className="flex items-center gap-3">
      <Link 
        href="/sign-in"
        className="text-sm text-gray hover:text-white transition-colors"
      >
        Sign in
      </Link>
      <Link 
        href="/sign-up"
        className="px-4 py-2 text-sm font-medium bg-mint text-gray-dark rounded-lg hover:bg-mint-light transition-colors"
      >
        Get Started
      </Link>
    </div>
  );
}
