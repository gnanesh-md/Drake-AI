import * as React from "react";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <div className="flex overflow-hidden flex-col px-20 pt-5 pb-60 bg-neutral-800 max-md:px-5 max-md:pb-24">
      <div className="flex flex-wrap gap-5 justify-between items-center w-full text-xs font-medium tracking-widest leading-6 uppercase max-md:max-w-full">
        <div className="self-stretch my-auto text-3xl font-bold leading-none bg-clip-text bg-gradient-to-r from-[#9B51E0] to-[#3081ED] text-transparent">
          Well Log Digitization
        </div>
        <div className="flex gap-8 self-stretch my-auto">
          {/* <div className="grow font-bold bg-clip-text bg-gradient-to-r from-[#9B51E0] to-[#3081ED] text-transparent">
            Home
          </div> */}
          {/* <div className="text-stone-300"> services</div>
          <div className="text-stone-300">activity</div>
          <div className="basis-auto text-stone-300">how it works</div> */}
        </div>
        <div className="flex gap-8 self-stretch text-stone-300">
          <Link to="/login" className="px-9 py-3 whitespace-nowrap rounded-xl border border-solid border-zinc-300 max-md:px-5">
            Sign In
          </Link>
          {/* <Link to="/login" className="my-auto">sign in</Link> */}
        </div>
      </div>
      <div className="mt-44 max-md:mt-10 max-md:max-w-full">
        <div className="flex gap-5 max-md:flex-col">
          <div className="flex flex-col w-6/12 max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow max-md:mt-10 max-md:max-w-full">
              <div className="self-start text-7xl font-semibold tracking-tighter text-white leading-[82px] max-md:max-w-full max-md:text-4xl max-md:leading-[50px]">
                TRACK YOUR GRAPHS ,<br />
                EFFORTLESSLY WITH <br />
                PRECISION
              </div>
              <div className="mt-28 text-2xl tracking-wide leading-9 text-neutral-200 max-md:mt-10 max-md:max-w-full">
                Convert complex graphs into editable, searchable data with Well Log Digitization.
                Seamlessly extract information from images and streamline your workflow.
              </div>
            </div>
          </div>
          <div className="flex flex-col ml-5 w-6/12 max-md:ml-0 max-md:w-full">
            <img
              loading="lazy"
              srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=800 800w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1200 1200w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=1600 1600w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120&width=2000 2000w, https://cdn.builder.io/api/v1/image/assets/TEMP/439fe974235eea5c75dc058b8a827b888070e844b0349bb59df09dd274416be8?placeholderIfAbsent=true&apiKey=1d485f9dde7143abb922c2dffce25120"
              className="object-contain self-stretch my-auto w-full aspect-[1.49] rounded-[30px] max-md:mt-10 max-md:max-w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-5 max-w-full text-2xl tracking-tighter whitespace-nowrap w-[476px]">
        <Link to="/login" className="gap-2.5 self-stretch px-6 py-3 font-semibold text-white rounded-2xl max-md:px-5 bg-gradient-to-r from-[#9B51E0] to-[#3081ED]">
          Sign In
        </Link>
        {/* <div className="gap-2.5 self-stretch px-6 py-3 rounded-2xl border border-solid border-zinc-300 text-zinc-300 max-md:px-5">
          Create
        </div> */}
      </div>
    </div>
  );
}
