import * as React from "react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <div className="flex flex-col justify-center items-center px-16 py-20 border-t bg-blend-normal bg-[#1B1724] border-white border-opacity-10 max-md:px-5 mt-[4rem]">
      <div className="flex flex-wrap gap-10 items-start w-full max-w-screen-xl bg-blend-normal min-h-[270px] max-md:max-w-full">
        <div className="flex flex-col grow shrink pt-14 pb-8 text-white bg-blend-normal min-w-[240px] w-[410px] max-md:max-w-full">
          <div className="flex flex-col pr-60 text-xl leading-relaxed bg-blend-normal min-h-[64px] max-md:pr-5 max-md:pb-24 max-md:max-w-full">
            <div>Customer Feedback Analytics </div>
            <div>like it is supposed to be!</div>
          </div>
          <div className="self-start mt-24 text-base leading-8 max-md:mt-10">
            Copyright © 2024 All Rights Reserved
          </div>
        </div>
        <div className="flex flex-wrap grow shrink gap-10 items-start pl-16 text-base leading-none text-violet-200 bg-blend-normal min-h-[270px] min-w-[240px] w-[602px] max-md:max-w-full">
          <div className="flex flex-col grow shrink items-start pt-px pb-16 bg-blend-normal w-[73px]">
            <div className="self-stretch text-xl font-bold text-white">
              Company
            </div>
            <Link to="/" className="mt-6">Home</Link>
            <div className="mt-6">About Us</div>
            <div className="mt-6">Careers</div>
            <div className="mt-6">Press</div>
          </div>
          <div className="flex flex-col grow shrink items-start pr-9 pb-28 whitespace-nowrap bg-blend-normal w-[152px] max-md:pb-24">
            <div className="text-xl font-bold text-white">Product</div>
            <div className="mt-6">Changelog</div>
            <div className="mt-6">Integrations</div>
            <div className="mt-6">Templates</div>
          </div>
          <div className="flex flex-col grow shrink items-start pb-16 bg-blend-normal w-[156px]">
            <div className="text-xl font-bold text-white">Resources</div>
            <div className="mt-6">Privacy Policy</div>
            <div className="mt-6">Security</div>
            <div className="self-stretch mt-6">Commitment to Privacy</div>
            <div className="mt-6">Contact Us</div>
          </div>
        </div>
      </div>
    </div>
  );
}