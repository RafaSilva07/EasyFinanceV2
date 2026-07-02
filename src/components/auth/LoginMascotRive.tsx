"use client";

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

type LoginMascotRiveProps = {
  emailValue: string;
  isEmailFocused: boolean;
  isPasswordFocused: boolean;
  isSubmitting: boolean;
  isSuccess: boolean;
  isError: boolean;
  pointerLook?: number;
};

const stateMachine = "LoginStateMachine";

function setInput(input: ReturnType<typeof useStateMachineInput>, value: boolean | number) {
  if (!input) return;
  input.value = value;
}

export function LoginMascotRive({
  emailValue,
  isEmailFocused,
  isPasswordFocused,
  isSubmitting,
  isSuccess,
  isError,
  pointerLook = 0,
}: LoginMascotRiveProps) {
  const [riveStatus, setRiveStatus] = useState<"checking" | "available" | "missing">("checking");

  useEffect(() => {
    let cancelled = false;

    fetch("/rive/login-mascot.riv", { method: "HEAD" })
      .then((response) => {
        if (!cancelled) setRiveStatus(response.ok ? "available" : "missing");
      })
      .catch(() => {
        if (!cancelled) setRiveStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (riveStatus !== "available") {
    return (
      <MascotFallback
        emailValue={emailValue}
        isEmailFocused={isEmailFocused}
        isPasswordFocused={isPasswordFocused}
        isSubmitting={isSubmitting}
        isSuccess={isSuccess}
        isError={isError}
        pointerLook={pointerLook}
      />
    );
  }

  return (
    <RiveMascot
      emailValue={emailValue}
      isEmailFocused={isEmailFocused}
      isPasswordFocused={isPasswordFocused}
      isSubmitting={isSubmitting}
      isSuccess={isSuccess}
      isError={isError}
      pointerLook={pointerLook}
    />
  );
}

function RiveMascot({
  emailValue,
  isEmailFocused,
  isPasswordFocused,
  isSubmitting,
  isSuccess,
  isError,
  pointerLook = 0,
}: LoginMascotRiveProps) {
  const [failed, setFailed] = useState(false);
  const { RiveComponent, rive } = useRive({
    src: "/rive/login-mascot.riv",
    stateMachines: stateMachine,
    autoplay: true,
    onLoadError: () => setFailed(true),
  });

  const isTypingEmail = useStateMachineInput(rive, stateMachine, "isTypingEmail");
  const isTypingPassword = useStateMachineInput(rive, stateMachine, "isTypingPassword");
  const passwordFocused = useStateMachineInput(rive, stateMachine, "isPasswordFocused");
  const isChecking = useStateMachineInput(rive, stateMachine, "isChecking");
  const success = useStateMachineInput(rive, stateMachine, "isSuccess");
  const error = useStateMachineInput(rive, stateMachine, "isError");
  const lookValue = useStateMachineInput(rive, stateMachine, "lookValue");

  useEffect(() => {
    setInput(isTypingEmail, isEmailFocused || emailValue.length > 0);
    setInput(isTypingPassword, isPasswordFocused);
    setInput(passwordFocused, isPasswordFocused);
    setInput(isChecking, isSubmitting);
    setInput(success, isSuccess);
    setInput(error, isError);
    setInput(lookValue, Math.min(emailValue.length * 3, 100));
  }, [
    emailValue,
    error,
    isChecking,
    isEmailFocused,
    isError,
    isPasswordFocused,
    isSubmitting,
    isSuccess,
    isTypingEmail,
    isTypingPassword,
    lookValue,
    passwordFocused,
    success,
  ]);

  if (failed) {
    return (
      <MascotFallback
        emailValue={emailValue}
        isEmailFocused={isEmailFocused}
        isPasswordFocused={isPasswordFocused}
        isSubmitting={isSubmitting}
        isSuccess={isSuccess}
        isError={isError}
        pointerLook={pointerLook}
      />
    );
  }

  return (
    <div className="relative mx-auto mb-5 h-36 w-36 overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
      <RiveComponent className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/60" />
    </div>
  );
}

function MascotFallback({
  emailValue,
  isEmailFocused,
  isPasswordFocused,
  isSubmitting,
  isSuccess,
  isError,
  pointerLook = 0,
}: LoginMascotRiveProps) {
  const emailLook = Math.min(emailValue.length * 0.35, 9);
  const lookX = isPasswordFocused ? 0 : isEmailFocused ? emailLook : pointerLook * 8;
  const lookY = isPasswordFocused ? -1 : isEmailFocused ? 3 : 0;
  const armTransform = isPasswordFocused
    ? "translateY(-54px) rotate(0deg)"
    : isSubmitting
      ? "translateY(-18px) rotate(-8deg)"
      : "translateY(0) rotate(-18deg)";
  const rightArmTransform = isPasswordFocused
    ? "translateY(-54px) rotate(0deg)"
    : isSubmitting
      ? "translateY(-18px) rotate(8deg)"
      : "translateY(0) rotate(18deg)";
  const mouthClass = isError
    ? "h-3 w-10 rounded-t-full border-t-4 border-gray-800"
    : isSuccess
      ? "h-5 w-12 rounded-b-full bg-gray-800"
      : "h-3 w-9 rounded-b-full border-b-4 border-gray-800";

  return (
    <div className="relative mx-auto mb-4 h-44 w-56 overflow-visible" aria-hidden="true">
      <div className="absolute left-1/2 top-1 h-36 w-40 -translate-x-1/2 animate-[float_3s_ease-in-out_infinite]">
        <div className="absolute left-5 top-5 size-10 rounded-full border-4 border-white bg-rose-100 shadow-sm" />
        <div className="absolute right-5 top-5 size-10 rounded-full border-4 border-white bg-rose-100 shadow-sm" />
        <div className="absolute inset-x-0 top-7 h-30 rounded-[44%_44%_38%_38%] border border-gray-200 bg-white shadow-sm" />
        <div className="absolute left-1/2 top-4 h-8 w-16 -translate-x-1/2 rounded-full bg-emerald-100">
          <div className="absolute left-1/2 top-3 h-1.5 w-9 -translate-x-1/2 rounded-full bg-emerald-500" />
        </div>
        <div className="absolute left-9 top-16 size-8 rounded-full bg-gray-100">
          <div
            className="absolute left-2 top-2 size-3 rounded-full bg-gray-900 transition-transform duration-200"
            style={{ transform: `translate(${lookX}px, ${lookY}px)` }}
          />
        </div>
        <div className="absolute right-9 top-16 size-8 rounded-full bg-gray-100">
          <div
            className="absolute left-2 top-2 size-3 rounded-full bg-gray-900 transition-transform duration-200"
            style={{ transform: `translate(${lookX}px, ${lookY}px)` }}
          />
        </div>
        <div className="absolute left-1/2 top-[88px] h-5 w-9 -translate-x-1/2 rounded-full bg-rose-100">
          <div className="absolute left-1/2 top-1.5 h-1.5 w-3 -translate-x-1/2 rounded-full bg-rose-400" />
        </div>
        <div className={`absolute left-1/2 top-[112px] -translate-x-1/2 transition-all duration-300 ${mouthClass}`} />
        <div className="absolute -right-1 top-20 h-12 w-16 rotate-12 rounded-lg bg-gray-900 p-1.5 shadow-sm">
          <div className="h-3 w-full rounded bg-emerald-400" />
          <div className="mt-3 h-1.5 w-8 rounded bg-white/80" />
        </div>
        <div
          className="absolute left-0 top-[118px] h-16 w-10 origin-top rounded-full bg-white shadow-sm transition-transform duration-300"
          style={{ transform: armTransform }}
        />
        <div
          className="absolute right-0 top-[118px] h-16 w-10 origin-top rounded-full bg-white shadow-sm transition-transform duration-300"
          style={{ transform: rightArmTransform }}
        />
        {isPasswordFocused ? (
          <>
            <div className="absolute left-8 top-[64px] h-12 w-12 rounded-full bg-white shadow-sm transition-all duration-300" />
            <div className="absolute right-8 top-[64px] h-12 w-12 rounded-full bg-white shadow-sm transition-all duration-300" />
          </>
        ) : null}
      </div>
      <div className="absolute bottom-0 left-1/2 h-8 w-44 -translate-x-1/2 rounded-full bg-gray-200/70 blur-md" />
      <p className="absolute bottom-1 left-1/2 w-full -translate-x-1/2 text-center text-xs font-semibold text-gray-500">
        {isPasswordFocused ? "Nao vou espiar sua senha" : "Organize seu mes com clareza"}
      </p>
    </div>
  );
}
