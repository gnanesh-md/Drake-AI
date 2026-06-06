import React, { useState } from "react";
import { useNavigate, Link } from 'react-router-dom';
import axios from "axios";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { NODE_API } from "../../config/constants";


export function SignUp() {
  const navigate = useNavigate();
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);  // State to toggle password visibility
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate form data
    if (!fullname || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      // Make API request
      const response = await axios.post(NODE_API+"/auth/register", {
        fullname,
        email,
        password,
        confirmPassword,
      });

      if (response.status === 201) {
        setSuccess("User created successfully!");
        setTimeout(() => {
            navigate('/login');
        }, 2000); // Redirect after 2 seconds
      }
    } catch (err) {
      if (err.response && err.response.data) {
        setError(err.response.data.error || "Registration failed.");
      } else {
        setError("Registration failed. Please try again.");
      }
    }
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
                <Link to="/login" className="font-medium">Sign in!</Link>
              </div>
              <div className="mt-14 ml-12 text-2xl font-semibold leading-10 max-md:mt-10 max-md:ml-2.5">
                Get Started With Well Log Digitization
              </div>
              <div className="self-center text-base leading-none text-zinc-500">
                Getting started is easy
              </div>
              <div className="flex gap-3.5 mt-11 ml-16 text-xs font-medium leading-10 whitespace-nowrap max-md:mt-10 max-md:ml-2.5">
                {/* <div className="flex gap-2 self-start px-6 bg-white rounded-md border border-solid border-neutral-800 shadow-[0px_5px_12px_rgba(0,0,0,0.05)] max-md:px-5">
                  <img
                    loading="lazy"
                    src="https://cdn.builder.io/api/v1/image/assets/TEMP/0a4b7bcb7ac7455185f7c9fc90b313091a3b274ccbc42b58923a2e81076509e5?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                    className="object-contain shrink-0 my-auto aspect-square w-[22px]"
                  />
                  <div>Google</div>
                </div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/81543c47dd666b6bca4eefa751186e46b1024acd23e0dd69d4ab809ea7b0c68c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 max-w-full rounded-none aspect-[2.87] w-[126px]"
                /> */}
              </div>
              {/* <div className="flex gap-3 items-center mt-9 text-sm leading-none text-black max-md:ml-1.5">
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/1931a8daa1559511fb575dda931561cfe00ee49ae84a41a113b104d33a6b41d5?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 self-stretch my-auto max-w-full aspect-[125] w-[130px]"
                />
                <div className="grow shrink self-stretch w-[86px] whitespace-nowrap">
                  Or continue with
                </div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/1931a8daa1559511fb575dda931561cfe00ee49ae84a41a113b104d33a6b41d5?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 self-stretch my-auto max-w-full aspect-[125] w-[130px]"
                />
              </div> */}
              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col">
                <input
                  type="text"
                  className="px-6 py-5 mt-6 bg-white rounded-xl border border-solid border-zinc-300 shadow-md text-zinc-600"
                  placeholder="Full Name"
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                />
                <input
                  type="email"
                  className="px-6 py-5 mt-5 w-full bg-white rounded-xl border border-solid border-zinc-300 shadow-md text-zinc-600"
                  placeholder="Enter Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className="relative mt-5">
              <input
                type={showPassword ? "text" : "password"}  // Toggle input type
                className="px-6 py-5 w-full bg-white rounded-xl border border-solid border-zinc-300 shadow-md text-zinc-600"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span
                className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEye /> : <FaEyeSlash />}
              </span>
            </div>
            <div className="relative mt-5">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="px-6 py-5 w-full bg-white rounded-xl border border-solid border-zinc-300 shadow-md text-zinc-600"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <span
                className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <FaEye /> : <FaEyeSlash />}
              </span>
            </div>

                {/* Error message */}
                {error && (
                  <div className="text-red-500 mt-4">{error}</div>
                )}

                {/* Success message */}
                {success && (
                  <div className="text-green-500 mt-4">{success}</div>
                )}

                <button
                  type="submit"
                  className="gap-2.5 self-center font-bold px-6 py-6 mt-5 text-base leading-none text-white text-center rounded-2xl min-h-[55px] w-[25rem] bg-gradient-to-r from-[#9B51E0] to-[#3081ED]"
                >
                  Create Account
                </button>
              </form>
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
