// import React, { useState } from 'react';
// import axios from 'axios';
// import { AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';

// const ForgotPassword = () => {
//     const [step, setStep] = useState(1); // Step 1: Email submission, Step 2: OTP verification and password reset
//     const [email, setEmail] = useState('');
//     const [otp, setOtp] = useState('');
//     const [newPassword, setNewPassword] = useState('');
//     const [confirmPassword, setConfirmPassword] = useState('');
//     const [message, setMessage] = useState('');
//     const [showPassword, setShowPassword] = useState(false);
//     const [showConfirmPassword, setShowConfirmPassword] = useState(false);

//     const handleEmailSubmit = async (e) => {
//         e.preventDefault();

//         try {
//             const response = await axios.post('http://18.235.44.185:5000/auth/forgot-password', { email });

//             if (response.status === 200) {
//                 setMessage('OTP sent to your email. Please check your inbox.');
//                 setStep(2); // Move to the OTP verification and password reset step
//             } else {
//                 setMessage(response.data.error || 'Failed to send OTP. Please try again.');
//             }
//         } catch (err) {
//             setMessage(err.response?.data?.error || 'Failed to send OTP. Please try again.');
//         }
//     };

//     const handleResetPasswordSubmit = async (e) => {
//         e.preventDefault();

//         if (newPassword !== confirmPassword) {
//             setMessage("Passwords do not match.");
//             return;
//         }

//         try {
//             const response = await axios.post('http://18.235.44.185:5000/auth/reset-password', { email, otp, newPassword });

//             if (response.status === 200) {
//                 setMessage('Password updated successfully! Redirecting to login...');
//                 setTimeout(() => {
//                     window.location.href = '/login';
//                 }, 2000); // Redirect after 2 seconds
//             } else {
//                 setMessage(response.data.error || 'Failed to update password. Please try again.');
//             }
//         } catch (err) {
//             setMessage(err.response?.data?.error || 'Failed to update password. Please try again.');
//         }
//     };

//     const togglePasswordVisibility = () => {
//         setShowPassword(!showPassword);
//     };

//     const toggleConfirmPasswordVisibility = () => {
//         setShowConfirmPassword(!showConfirmPassword);
//     };

//     return (
//         <section className="bg-gray-50 dark:bg-gray-900">
//             <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
//                 <a href="#" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
//                     <img
//                         loading="lazy"
//                         srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/44be72a56378bc7003f011e7957af9d1797e94f69340f2416e9c1f3e5a0e965a?apiKey=1d485f9dde7143abb922c2dffce25120&&apiKey=1d485f9dde7143abb922c2dffce25120"
//                         className="shrink-0 max-w-full aspect-[1.54] w-[147px]"
//                         alt="Logo"
//                     />
//                 </a>
//                 <div className="w-full bg-white rounded-lg shadow dark:border sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
//                     <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
//                         <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
//                             {step === 1 ? 'Forgot Password' : 'Reset Password'}
//                         </h1>
//                         {message && <p className="text-sm font-medium text-red-600 dark:text-red-400">{message}</p>}
//                         {step === 1 ? (
//                             <form className="space-y-4 md:space-y-6" onSubmit={handleEmailSubmit}>
//                                 <div>
//                                     <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your email</label>
//                                     <input
//                                         type="email"
//                                         name="email"
//                                         id="email"
//                                         value={email}
//                                         onChange={(e) => setEmail(e.target.value)}
//                                         className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
//                                         placeholder="name@company.com"
//                                         required
//                                     />
//                                 </div>
//                                 <button type="submit" className="w-full text-white bg-gradient-to-r from-[#9B51E0] to-[#3081ED] hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800">Send OTP</button>
//                             </form>
//                         ) : (
//                             <form className="space-y-4 md:space-y-6" onSubmit={handleResetPasswordSubmit}>
//                                 <div>
//                                     <label htmlFor="otp" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">OTP</label>
//                                     <input
//                                         type="text"
//                                         name="otp"
//                                         id="otp"
//                                         value={otp}
//                                         onChange={(e) => setOtp(e.target.value)}
//                                         className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
//                                         placeholder="Enter OTP"
//                                         required
//                                     />
//                                 </div>
//                                 <div className="relative">
//                                     <label htmlFor="new-password" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">New Password</label>
//                                     <input
//                                         type={showPassword ? 'text' : 'password'}
//                                         name="new-password"
//                                         id="new-password"
//                                         value={newPassword}
//                                         onChange={(e) => setNewPassword(e.target.value)}
//                                         placeholder="••••••••"
//                                         className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
//                                         required
//                                     />
//                                     <button 
//                                         type="button" 
//                                         className="absolute inset-y-0 right-0 top-6 flex items-center pr-3" 
//                                         onClick={togglePasswordVisibility}
//                                     >
//                                         {showPassword ? (
//                                             <AiOutlineEye className="text-gray-500 dark:text-gray-400" />
//                                         ) : (
//                                             <AiOutlineEyeInvisible className="text-gray-500 dark:text-gray-400" />
//                                         )}
//                                     </button>
//                                 </div>
//                                 <div className="relative">
//                                     <label htmlFor="confirm-password" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Confirm New Password</label>
//                                     <input
//                                         type={showConfirmPassword ? 'text' : 'password'}
//                                         name="confirm-password"
//                                         id="confirm-password"
//                                         value={confirmPassword}
//                                         onChange={(e) => setConfirmPassword(e.target.value)}
//                                         placeholder="••••••••"
//                                         className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
//                                         required
//                                     />
//                                     <button 
//                                         type="button" 
//                                         className="absolute inset-y-0 right-0 top-6 flex items-center pr-3" 
//                                         onClick={toggleConfirmPasswordVisibility}
//                                     >
//                                         {showConfirmPassword ? (
//                                             <AiOutlineEye className="text-gray-500 dark:text-gray-400" />
//                                         ) : (
//                                             <AiOutlineEyeInvisible className="text-gray-500 dark:text-gray-400" />
//                                         )}
//                                     </button>
//                                 </div>
//                                 <button type="submit" className="w-full text-white bg-blue-900 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800">Reset Password</button>
//                             </form>
//                         )}
//                     </div>
//                 </div>
//             </div>
//         </section>
//     );
// };

// export default ForgotPassword;