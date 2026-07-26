import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F6F6]">
      <SignIn />
    </div>
  );
}
