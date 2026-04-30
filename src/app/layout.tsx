import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import type { LocalizationResource } from '@clerk/types';
import './globals.css';

const clerkLocalization: LocalizationResource = {
  locale: 'da-DK',
  formButtonPrimary: 'Fortsæt',
  formButtonPrimary__verify: 'Bekræft',
  formFieldLabel__emailAddress: 'E-mailadresse',
  formFieldLabel__password: 'Adgangskode',
  formFieldInputPlaceholder__emailAddress: 'Indtast din e-mailadresse',
  formFieldInputPlaceholder__password: 'Indtast din adgangskode',
  formFieldAction__forgotPassword: 'Glemt adgangskode?',
  dividerText: 'eller',
  backButton: 'Tilbage',
  footerActionLink__useAnotherMethod: 'Brug en anden metode',
  signIn: {
    start: {
      title: 'Log ind',
      subtitle: 'Log ind for at behandle timesedler',
      actionText: 'Har du ikke en konto?',
      actionLink: 'Kontakt administrator',
      actionLink__use_email: 'Brug e-mail',
      actionLink__use_phone: 'Brug telefonnummer',
      actionLink__use_username: 'Brug brugernavn',
      actionLink__use_email_username: 'Brug e-mail eller brugernavn',
      actionLink__use_passkey: 'Brug passkey',
    },
    password: {
      title: 'Indtast din adgangskode',
      subtitle: 'Fortsæt for at åbne appen',
      actionLink: 'Brug en anden metode',
    },
    forgotPassword: {
      title: 'Nulstil din adgangskode',
      subtitle: 'Vi sender dig instruktioner til at nulstille din adgangskode.',
      subtitle_email: 'Vi sender dig instruktioner til din e-mailadresse.',
      subtitle_phone: 'Vi sender dig instruktioner til dit telefonnummer.',
      formTitle: 'Tjek din indbakke',
      resendButton: 'Send igen',
    },
    emailCode: {
      title: 'Tjek din e-mail',
      subtitle: 'Indtast koden, vi har sendt til din e-mailadresse.',
      formTitle: 'Bekræftelseskode',
      resendButton: 'Send igen',
    },
    alternativeMethods: {
      title: 'Andre loginmetoder',
      subtitle: 'Vælg en anden måde at logge ind på.',
      actionLink: 'Tilbage til login',
      actionText: 'Vil du prøve en anden metode?',
      blockButton__emailLink: 'Login-link på e-mail',
      blockButton__emailCode: 'Kode via e-mail',
      blockButton__phoneCode: 'Kode via telefon',
      blockButton__password: 'Adgangskode',
      blockButton__passkey: 'Passkey',
      blockButton__totp: 'Godkendelsesapp',
      blockButton__backupCode: 'Backupkode',
      getHelp: {
        title: 'Brug for hjælp?',
        content: 'Kontakt en administrator, hvis du ikke kan logge ind.',
        blockButton__emailSupport: 'Kontakt support',
      },
    },
  },
};

export const metadata: Metadata = {
  title: 'Timeseddelbehandler',
  description: 'Behandl og juster arbejdstimer fra Excel-timesedler',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body className="bg-gray-100 text-slate-900">
        <ClerkProvider localization={clerkLocalization}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
