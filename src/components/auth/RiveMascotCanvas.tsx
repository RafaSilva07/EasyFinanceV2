"use client";

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import type { LoginMascotRiveProps } from "./LoginMascotRive";

const stateMachine = "LoginStateMachine";

function setInput(input: ReturnType<typeof useStateMachineInput>, value: boolean | number) {
  if (input) input.value = value;
}

export function RiveMascotCanvas({ fallback, ...props }: LoginMascotRiveProps & { fallback: React.ReactNode }) {
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
    setInput(isTypingEmail, props.isEmailFocused || props.emailValue.length > 0);
    setInput(isTypingPassword, props.isPasswordFocused);
    setInput(passwordFocused, props.isPasswordFocused);
    setInput(isChecking, props.isSubmitting);
    setInput(success, props.isSuccess);
    setInput(error, props.isError);
    setInput(lookValue, Math.min(props.emailValue.length * 3, 100));
  }, [error, isChecking, isTypingEmail, isTypingPassword, lookValue, passwordFocused, props.emailValue, props.isEmailFocused, props.isError, props.isPasswordFocused, props.isSubmitting, props.isSuccess, success]);

  if (failed) return fallback;

  return (
    <div className="relative mx-auto mb-5 h-36 w-36 overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
      <RiveComponent className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/60" />
    </div>
  );
}
