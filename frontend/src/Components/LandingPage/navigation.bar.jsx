import * as React from "react";
import { Link } from "react-router-dom";

export function NavigationBar() {
  return (
    <div className="flex justify-between items-center px-20 py-3 text-base leading-none bg-blend-normal bg-neutral-900 max-md:px-5">
      {/* Logo Section */}
      <Link to="/" className="text-3xl font-bold tracking-widest leading-none uppercase bg-clip-text bg-gradient-to-r from-[#9B51E0] to-[#3081ED] text-transparent white">
        Well Log Digitization
      </Link>

      {/* Center Links */}
      <div className="flex gap-10 text-white font-medium">
        {/* <div className="px-4 py-5">Home</div> */}
        {/* <div className="flex gap-2 px-4 py-5">
          <div>Services</div>
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/TEMP/dfbb89b9af8749cdd1282b619e35c0c96e5e92ab7b727eee02ae19c99ec6842d?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
            className="object-contain my-auto aspect-[1.5] w-[9px]"
          />
        </div>
        <div className="px-4 py-5">Pricing</div> */}
      </div>

      {/* Right Section: Sign In & Book a Demo */}
      <div className="flex gap-5 items-center">
        {/* <Link to="/login" className="font-medium text-white cursor-pointer">Sign In</Link> */}
        <Link to="/login" className="relative p-[2px] rounded-[160px] bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc]">
          <div className="px-8 py-3.5 font-semibold text-white bg-neutral-900 rounded-[160px] hover:bg-[#1B1724] whitespace-nowrap">
            Sign In
          </div>
        </Link>
      </div>
    </div>
  );
}
