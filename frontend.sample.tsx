 import { css } from '@emotion/css';
 import {
   Avatar,
   Box,
   Button,
   ButtonGroup,
   Grid,
   InputAdornment,
   Paper,
   TextField,
   Tooltip,
   Typography,
 } from '@mui/material';
 import React, { useState } from 'react';
 import { Controller, useForm } from 'react-hook-form';
 import { Link } from 'react-router-dom';
 
 import { LswLoader } from '../Components/lsw-loader';
 import useMobileReponsiveness from '../hooks/useMobileReponsiveness';
 import useMuiResetFormTempFix from '../hooks/useMuiResetFormTempFix';
 import { useUser } from '../hooks/useUser';
 import { API } from '../services/api';
 import { notify } from '../shared';
 import { BrandColors } from '../styles/brand-colors';
 import CountrySelect from '../ui/components/country-select';
 import DatePicker from '../ui/components/date-picker';
 import { FormTextField } from '../ui/components/form-text-field';
 import GenderSelect from '../ui/components/gender-select';
 import IdSelect from '../ui/components/id-select';
 import { UTILS } from '../utils';
 
 const Profile = () => {
   const { currentUser, updateCurrentUser } = useUser();
   const emailHash = UTILS.emailHash(currentUser?.email as string);
   const { isMobileView } = useMobileReponsiveness();
   const [isWorking, setIsWorking] = useState<boolean>(false);
 
   const {
     handleSubmit,
     control,
     formState: { errors },
     reset,
   } = useForm();
   // temporary work around for MUI not resetting/updating fields. @todo
   const { isFormMounted, dismountForm, remountForm } = useMuiResetFormTempFix();
 
   const onSubmit = async (data: any) => {
     if (!currentUser?._id) {
       return;
     }
 
     const { ID: rawIdentification } = data;
     const identification = UTILS.deserializeIdData(rawIdentification);
     const updates = {
       ...data,
       ID: identification,
     };
 
     setIsWorking(true);
     try {
       await API.put(`/users/current`, updates);
       dismountForm();
       notify({
         type: 'success',
         callback: async () => {
           setIsWorking(false);
           await updateCurrentUser();
           reset();
           remountForm();
         },
         message: `Updated successfully`,
       });
     } catch (error) {
       setIsWorking(false);
       notify({
         type: 'error',
         message: UTILS.getErrorMessage(error),
       });
     }
   };
 
   return (
     <Paper elevation={6} sx={{ p: 4, mb: 4 }}>
       <Box display="flex" justifyContent="space-between" mb={3}>
         <Grid container spacing={4} mb={2}>
           <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'start' }}>
             <Box>
               <Typography variant="h5" sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                 {currentUser?.firstName}&nbsp; {currentUser?.lastName}
               </Typography>
             </Box>
           </Grid>
           <Grid item xs={12} md={6} container direction="row" justifyContent="flex-end" alignItems="center">
             <ButtonGroup variant="outlined" size="small" fullWidth={isMobileView} aria-label="outlined button group">
               <Button variant="contained">View Profile</Button>
               <Tooltip title="Coming soon">
                 <>
                   <Button title="Not available. Coming soon">Upload Documents</Button>
                 </>
               </Tooltip>
             </ButtonGroup>
           </Grid>
         </Grid>
       </Box>
       <Box sx={{ flexGrow: 1 }}>
         <Grid container spacing={4}>
           <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <Box>
               <Avatar
                 alt={currentUser?.firstName}
                 sx={{ width: 160, height: 160 }}
                 src={currentUser?.avatarUrl ?? `https://www.gravatar.com/avatar/${emailHash}.jpg?d=identicon`}
               />
             </Box>
             <Box
               className={css({
                 paddingTop: '2rem',
               })}>
               <Button
                 variant="contained"
                 // eslint-disable-next-line max-len
                 href="https://wordpress.com/start/wpcc/oauth2-user?ref=oauth2&oauth2_redirect=https%3A%2F%2Fpublic-api.wordpress.com%2Foauth2%2Fauthorize%2F%3Fclient_id%3D1854%26response_type%3Dcode%26blog_id%3D0%26state%3D9d81f5061063583c21aa02af69b86d635b42fe3edfce57c2439f9e903f9dac2d%26redirect_uri%3Dhttps%253A%252F%252Fen.gravatar.com%252Fconnect%252F%253Faction%253Drequest_access_token%26jetpack-code%26jetpack-user-id%3D0%26action%3Doauth2-login&oauth2_client_id=1854"
                 target="_blank">
                 Change
               </Button>
             </Box>
           </Grid>
           <Grid item xs={12} md={8}>
             {isFormMounted && (
               <form onSubmit={handleSubmit(onSubmit)}>
                 <Grid container spacing={4}>
                   <Grid item xs={12} md={6}>
                     <TextField
                       fullWidth
                       size="small"
                       value={currentUser?.email}
                       label="Email"
                       sx={{ background: BrandColors.smoke }}
                       InputProps={{
                         disabled: true,
                         endAdornment: (
                           <InputAdornment position="end">
                             <Button
                               variant="contained"
                               size="small"
                               component={Link}
                               disabled
                               to="/profile/update-email-address"
                               sx={{ fontSize: '0.6rem' }}>
                               Change
                             </Button>
                           </InputAdornment>
                         ),
                       }}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <TextField
                       fullWidth
                       size="small"
                       value={currentUser?.phoneNumber}
                       label="Phone"
                       sx={{ background: BrandColors.smoke }}
                       InputProps={{
                         disabled: true,
                         endAdornment: (
                           <InputAdornment position="end">
                             <Button
                               variant="contained"
                               size="small"
                               component={Link}
                               to="/profile/update-phone-number"
                               sx={{ fontSize: '0.6rem' }}>
                               {currentUser?.phoneNumber ? 'Change' : 'Add...'}
                             </Button>
                           </InputAdornment>
                         ),
                       }}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="firstName"
                       defaultValue={currentUser?.firstName}
                       control={control}
                       rules={{ required: 'Please Enter First Name' }}
                       render={({ field }) => (
                         <FormTextField
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="First Name"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="lastName"
                       defaultValue={currentUser?.lastName}
                       control={control}
                       rules={{ required: 'Please Enter Last Name' }}
                       render={({ field }) => (
                         <FormTextField
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Last Name"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="gender"
                       defaultValue={currentUser?.gender ?? ''}
                       control={control}
                       rules={{ required: 'Please select gender' }}
                       render={({ field }) => (
                         <GenderSelect {...UTILS.enhanceFieldwithErrors(field, errors)} label="Gender" />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="dateOfBirth"
                       defaultValue={currentUser?.dateOfBirth}
                       control={control}
                       rules={{ required: 'Please Enter Date of Birth' }}
                       render={({ field }) => (
                         <DatePicker {...UTILS.enhanceFieldwithErrors(field, errors)} label="Date of Birth" />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="ID"
                       defaultValue={currentUser?.ID ? UTILS.serializeIdData(currentUser?.ID) : undefined}
                       control={control}
                       rules={{ required: 'Please Enter National ID or Passport' }}
                       render={({ field }) => (
                         <IdSelect
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Identification"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="country"
                       defaultValue={currentUser?.country ?? 'ZA'}
                       control={control}
                       rules={{ required: 'Please Country' }}
                       render={({ field }) => (
                         <CountrySelect
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Country"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="town"
                       defaultValue={currentUser?.town}
                       control={control}
                       rules={{ required: 'Please Enter Town' }}
                       render={({ field }) => (
                         <FormTextField
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Town"
                         />
                       )}
                     />
                   </Grid>{' '}
                   <Grid item xs={12} md={6}>
                     <Controller
                       name="zipCode"
                       defaultValue={currentUser?.zipCode}
                       control={control}
                       render={({ field }) => (
                         <FormTextField
                           fullWidth
                           size="small"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Zip Code"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12}>
                     <Controller
                       name="address"
                       defaultValue={currentUser?.address?.trim()}
                       control={control}
                       rules={{ required: 'Please Enter address' }}
                       render={({ field }) => (
                         <FormTextField
                           fullWidth
                           size="small"
                           multiline
                           rows="2"
                           sx={{ background: BrandColors.smoke }}
                           {...UTILS.enhanceFieldwithErrors(field, errors)}
                           label="Address"
                         />
                       )}
                     />
                   </Grid>
                   <Grid item xs={12}>
                     <Button
                       type="submit"
                       variant="contained"
                       size="large"
                       fullWidth={isMobileView}
                       startIcon={isWorking ? <LswLoader mode="light" /> : undefined}>
                       {isWorking ? 'Loading...' : 'Update User'}
                     </Button>
                   </Grid>
                 </Grid>
               </form>
             )}
           </Grid>
         </Grid>
       </Box>
     </Paper>
   );
 };
 
 export default Profile;