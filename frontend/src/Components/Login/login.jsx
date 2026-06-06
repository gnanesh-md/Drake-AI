import * as React from "react";
import { Link } from "react-router-dom";
import { useState } from 'react';
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import GraphLogo from "../../assets/login-graph.png"
import { NODE_API } from "../../config/constants";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // State for toggling password visibility

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(NODE_API +"/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log("Login successful:", data);
        // Save token in localStorage and redirect to dashboard
        localStorage.setItem("token", data.token);
        window.location.href = "/dashboard";
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error("Error logging in:", err);
      setError("Failed to log in. Please try again later.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="overflow-hidden pl-20 bg-gray-100 max-md:pl-5">
      <div className="flex gap-5 max-md:flex-col">
        <div className="flex flex-col w-6/12 max-md:ml-0 max-md:w-full">
          <div className="flex flex-col mt-10 w-full max-md:max-w-full">
            <div className="flex flex-wrap gap-5 justify-between w-full text-black max-md:max-w-full">
              <div className="text-lg font-medium leading-10">
                Well Log Digitization</div>
              <div className="flex gap-2 my-auto text-sm leading-none">
                <div className="grow font-light">Don’t have an account?</div>
                <Link to="/signup" className="font-medium">Sign up!</Link>
              </div>
            </div>
            <div className="flex flex-col mt-24 ml-20 max-w-full w-[402px] max-md:mt-10 max-md:ml-2.5">
              <div className="self-center text-4xl font-semibold leading-none text-black">
                Welcome Back
              </div>
              <div className="self-center mt-1.5 text-lg leading-loose text-black">
                Login into your account
              </div>
              <div className="flex gap-3.5 self-center mt-10 max-w-full text-xs font-medium leading-10 text-black whitespace-nowrap w-[266px]">
                {/* <div className="flex flex-1 gap-2 self-start px-6 bg-white rounded-md border border-solid border-neutral-800 shadow-[0px_5px_12px_rgba(0,0,0,0.05)] max-md:px-5">
                  <img
                    loading="lazy"
                    src="https://cdn.builder.io/api/v1/image/assets/TEMP/a8c6cf75a7603f31f171191dfe7ed01436376a7b461aa84353e28a745b1b9792?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                    className="object-contain shrink-0 my-auto aspect-square w-[22px]"
                  />
                  <div>Google</div>
                </div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/fb5f6ff2795cd6ef603f3a8c7643982e7f72a989b0dd62104ee252d44c28a1ac?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 max-w-full rounded-none aspect-[2.87] w-[126px]"
                /> */}
              </div>
              {/* <div className="flex gap-3 items-center mt-9 text-sm leading-none text-black max-md:ml-1.5">
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/1931a8daa1559511fb575dda931561cfe00ee49ae84a41a113b104d33a6b41d5?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 self-stretch my-auto max-w-full aspect-[125] w-[130px]"
                />
                <div className="grow shrink self-stretch w-[86px]">
                  Or continue with
                </div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/TEMP/1931a8daa1559511fb575dda931561cfe00ee49ae84a41a113b104d33a6b41d5?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
                  className="object-contain shrink-0 self-stretch my-auto max-w-full aspect-[125] w-[130px]"
                />
              </div> */}
              {error && <div className="text-red-500 mt-4">{error}</div>}

              <form onSubmit={handleLogin} className="flex flex-col gap-4 mt-10">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="px-6 py-5 text-sm bg-white rounded-xl border border-zinc-300 shadow-sm text-zinc-600"
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"} // Conditionally show text or password
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="px-6 py-5 text-sm bg-white rounded-xl border border-zinc-300 shadow-sm text-zinc-600 w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 py-3 text-gray-600"
                  >
                    {showPassword ? (
                      <AiOutlineEye className="text-gray-500 dark:text-gray-400" />
                    ) : (
                      <AiOutlineEyeInvisible className="text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                </div>
                <div className="flex gap-10 mt-6 w-full justify-between">
                  <label className="flex items-center text-xs tracking-wide leading-loose text-zinc-900">
                    <input type="checkbox" className="mr-2" />
                    Remember me
                  </label>
                  <Link to="/forgot-password" className="text-sm font-light leading-none text-neutral-800">
                    Forgot Password ?
                  </Link>
                </div>
                <button
                  type="submit"
                  className="self-stretch px-6 py-5 mt-6 text-lg font-bold text-white bg-gradient-to-r from-[#9B51E0] to-[#3081ED] rounded-2xl min-h-[55px] w-[25rem] max-md:px-5 max-md:mt-10"
                  disabled={loading}
                >
                  {loading ? "Log In" : "Log In"}
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="flex flex-col ml-5 w-6/12 max-md:ml-0 max-md:w-full">
          <div className="flex flex-col grow py-32 pr-3.5 w-full text-white bg-blend-normal bg-neutral-800 max-md:py-24 max-md:mt-10 max-md:max-w-full">
            <img
              loading="lazy"
              srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=800 800w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1200 1200w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1600 1600w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=2000 2000w, https://cdn.builder.io/api/v1/image/assets/TEMP/5cadfd711fbcab5d9cd39e2855ed23a6961c6a307748fd2da1e28ad8599ffa2c?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
              className="object-contain w-full aspect-[2.23] max-md:max-w-full"
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
      </div>
    </div>
  );
}
