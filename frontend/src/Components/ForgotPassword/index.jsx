import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { NODE_API } from "../../config/constants";

export function ForgotPassword() {
  const [step, setStep] = useState(1); // Step 1: Email submission, Step 2: OTP verification and password reset
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        NODE_API +"/auth/forgot-password",
        { email }
      );

      if (response.status === 200) {
        setMessage("OTP sent to your email. Please check your inbox.");
        setStep(2); // Move to the OTP verification and password reset step
      } else {
        setMessage(
          response.data.error || "Failed to send OTP. Please try again."
        );
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error || "Failed to send OTP. Please try again."
      );
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      const response = await axios.post(
        NODE_API +"/auth/reset-password",
        { email, otp, newPassword }
      );

      if (response.status === 200) {
        setMessage("Password updated successfully! Redirecting to login...");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000); // Redirect after 2 seconds
      } else {
        setMessage(
          response.data.error || "Failed to update password. Please try again."
        );
      }
    } catch (err) {
      setMessage(
        err.response?.data?.error ||
          "Failed to update password. Please try again."
      );
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <div className="overflow-hidden pr-14 bg-gray-100 max-md:pr-5">
      <div className="flex gap-5 max-md:flex-col">
        <div className="flex flex-col w-6/12 max-md:ml-0 max-md:w-full">
          <div className="flex flex-col grow py-32 pr-3 w-full text-white bg-blend-normal bg-neutral-800 max-md:py-24 max-md:mt-10 max-md:max-w-full">
            <img
              loading="lazy"
              srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=800 800w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1200 1200w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1600 1600w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=2000 2000w, https://cdn.builder.io/api/v1/image/assets/TEMP/c194fbbf98a0a0eaa4bae73e9fd7e320e8ede2e961df695e622801b1995c236b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
              className="object-contain w-full aspect-[2.19] max-md:max-w-full"
            />
            <div className="flex flex-col self-center px-12 py-12 mt-20 max-w-full rounded-xl bg-blend-normal bg-red-50 bg-opacity-10 w-[547px] max-md:px-5 max-md:mt-10">
              <div className="flex gap-3 self-start px-4 py-3 text-sm leading-none rounded-xl bg-fuchsia-950">
                <img
                  loading="lazy"
                  srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=800 800w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1200 1200w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1600 1600w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=2000 2000w, https://cdn.builder.io/api/v1/image/assets/TEMP/6e9f76a1f0ee0b8602a950fcf2d276178eac8fc4c69ae68e10dba0fcc94bed6b?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 aspect-square w-[22px]"
                />
                <div className="my-auto basis-auto">Top Annotation service</div>
              </div>
              <div className="mt-6 text-xl leading-8 max-md:max-w-full">
                Today, we create innovative solutions to the challenges that
                consumers face in both their everyday lives and events.
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col ml-5 w-6/12 max-md:ml-0 max-md:w-full">
          <div className="flex flex-col mt-12 text-sm leading-none max-md:mt-10 max-md:max-w-full">
            <div className="flex flex-col items-center pl-12 w-full text-black max-md:pl-5 max-md:max-w-full">
              <div className="flex gap-1 self-end">
                <div className="grow font-light">have an account?</div>
                <Link to="/login" className="font-medium">
                  Sign in!
                </Link>
              </div>
              <div className="w-full rounded-lg sm:max-w-md xl:p-0 mt-[13rem]">
                    <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                        <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
                            {step === 1 ? 'Forgot Password' : 'Reset Password'}
                        </h1>
                        {message && <p className="text-sm font-medium text-red-600 dark:text-red-400">{message}</p>}
                        {step === 1 ? (
                            <form className="space-y-4 md:space-y-6" onSubmit={handleEmailSubmit}>
                                <div>
                                    <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                        placeholder="name@company.com"
                                        required
                                    />
                                </div>
                                <button type="submit" className="w-full text-white bg-gradient-to-r from-[#9B51E0] to-[#3081ED] hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800">Send OTP</button>
                            </form>
                        ) : (
                            <form className="space-y-4 md:space-y-6" onSubmit={handleResetPasswordSubmit}>
                                <div>
                                    <label htmlFor="otp" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">OTP</label>
                                    <input
                                        type="text"
                                        name="otp"
                                        id="otp"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                        placeholder="Enter OTP"
                                        required
                                    />
                                </div>
                                <div className="relative">
                                    <label htmlFor="new-password" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">New Password</label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="new-password"
                                        id="new-password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                        required
                                    />
                                    <button 
                                        type="button" 
                                        className="absolute inset-y-0 right-0 top-6 flex items-center pr-3" 
                                        onClick={togglePasswordVisibility}
                                    >
                                        {showPassword ? (
                                            <AiOutlineEye className="text-gray-500 dark:text-gray-400" />
                                        ) : (
                                            <AiOutlineEyeInvisible className="text-gray-500 dark:text-gray-400" />
                                        )}
                                    </button>
                                </div>
                                <div className="relative">
                                    <label htmlFor="confirm-password" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Confirm New Password</label>
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        name="confirm-password"
                                        id="confirm-password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                                        required
                                    />
                                    <button 
                                        type="button" 
                                        className="absolute inset-y-0 right-0 top-6 flex items-center pr-3" 
                                        onClick={toggleConfirmPasswordVisibility}
                                    >
                                        {showConfirmPassword ? (
                                            <AiOutlineEye className="text-gray-500 dark:text-gray-400" />
                                        ) : (
                                            <AiOutlineEyeInvisible className="text-gray-500 dark:text-gray-400" />
                                        )}
                                    </button>
                                </div>
                                <button type="submit" className="w-full text-white bg-gradient-to-r from-[#9B51E0] to-[#3081ED] hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800">Reset Password</button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
            <div className="self-center mt-8 font-light text-zinc-600 max-md:max-w-full">
              By continuing you indicate that you read and agreed to the Terms
              of Use
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
