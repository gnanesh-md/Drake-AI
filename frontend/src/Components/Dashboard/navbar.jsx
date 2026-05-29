import React,{useState} from 'react';
import graph from "../../assets/graph.png"
import { useNavigate } from "react-router-dom";
import LogoutIcon from "../../assets/logout.svg"

export default function Navbar() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const navigate = useNavigate();
  const handleSignOutClick = () => setIsPopupOpen(true);
  const handleCancelSignOut = () => setIsPopupOpen(false);
  const handleConfirmSignOut = () => {
    // Your signout logic here
    console.log("Signing out...");
    setIsPopupOpen(false);
  };
  const handleSignOut = () => {
    localStorage.removeItem("token");
    setIsPopupOpen(false);
    navigate("/");
  };
  return (
    <div className="flex items-center justify-between px-6 py-0 h-10 bg-gray-800 text-white">
      <div className="flex items-center border-r border-gray-600 pr-4 mr-4">
        <div className="flex items-center cursor-pointer font-bold select-none mr-2">

          <img
            alt="Graph Logo"
            src={graph}
            className="w-5 h-5 mr-2"
          />
          Graph Tracker
        </div>
      </div>
      <div className="flex items-center border-r border-gray-600 pr-4 mr-4">
        <div className="flex items-center">
          {/* <div className="flex items-center px-2 rounded transition duration-300 ease-in-out cursor-pointer font-semibold mr-1 hover:bg-gray-700">
            <img
              alt="actions"
              src="https://www.makesense.ai/ico/actions.png"
              className="w-4 h-4 mr-2 filter invert"
            />
            Actions
          </div> */}
          {/* <div className="flex items-center px-2 rounded transition duration-300 ease-in-out cursor-pointer font-semibold hover:bg-gray-700">
            <img
              alt="community"
              src="https://www.makesense.ai/ico/plant.png"
              className="w-4 h-4 mr-2 filter invert"
            />
            Community
          </div> */}
        </div>
      </div>
      {/* <div className="flex items-center flex-grow border-r border-gray-600 pr-4 mr-4">
        <div className="font-semibold mr-2 select-none">
          Project Name:
        </div>
        <div className="relative max-w-xs h-6 overflow-hidden">
          <input
            type="text"
            defaultValue="my-project-name"
            className="w-full h-full bg-transparent border-none text-white text-sm pl-1 focus:outline-none"
          />
          <div className="absolute bottom-0 left-0 w-full h-0 bg-white transition-all duration-300"></div>
        </div>
      </div> */}
      <div className="flex items-center">
        <div className="flex items-center justify-center rounded-full w-8 h-8 m-1 transition-transform duration-300 transform hover:scale-105">
          <a
            href="https://github.com/SkalskiP"
            rel="noopener noreferrer"
            target="_blank"
          >
            {/* <img
              alt="github-logo"
              src="https://www.makesense.ai/ico/github-logo.png"
              className="w-5 h-5 filter invert"
            /> */}
            
          </a>

        </div>
        {/* <div onClick={handleSignOutClick}className='mr-2 bg-gray-900 py-1 px-3 border border-gray-400 rounded-xl cursor-pointer'>Logout</div> */}
        <img src={LogoutIcon} onClick={handleSignOutClick} className="absolute right-4 px-1 py-0.5 text-white bg-blue-900 cursor-pointer rounded-lg shadow-lg hover:bg-black border border-gray-400" alt="" />
      </div>
      {isPopupOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold">
              Are you sure you want to sign out?
            </h2>
            <div className="flex justify-end gap-4 mt-4">
              <button
                onClick={handleCancelSignOut}
                className="px-4 py-2 bg-gray-300 text-black rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-700"
              >
                Signout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
