import { yupResolver } from "@hookform/resolvers/yup"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useContext, useEffect, useMemo, useState } from "react"
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form"
import { Fragment } from "react/jsx-runtime"
import Button from "src/Components/Button"
import Input from "src/Components/Input"
import InputNumber from "src/Components/InputNumber"
import userApi, { BodyUpdateProfile } from "src/apis/user.api"
import { AppContext } from "src/contexts/auth.context"
import { UserSchemaType, userSchema } from "src/utils/rules"
import DateSelect from "../../Components/DateSelect"
import { toast } from "react-toastify"
import { setProfileToLs } from "src/utils/auth"
import { getAvatarUrl, isError422 } from "src/utils/utils"
import { ErrorResponse } from "src/types/utils.type"
import InputFileImage from "../../Components/InputFileImage"
import { useTranslation } from "react-i18next"
import { Helmet } from "react-helmet-async"

type FormData1 = Pick<UserSchemaType, "name" | "address" | "avatar" | "phone" | "date_of_birth">
type FormDataString = {
  [key in keyof FormData1]: string
}
const profileSchema = userSchema.pick(["name", "address", "avatar", "phone", "date_of_birth"])

// form phức tạp thì dùng useForm kết hợp useFormContext - tách nhỏ ra rồi 1 thằng component cha (useForm) quản lý truyền xuống
// Profile truyền xuống Info
function Info() {
  const { t } = useTranslation("profile")
  const {
    register,
    formState: { errors },
    control
  } = useFormContext<FormData1>()
  return (
    <Fragment>
      <div className="sm:mt-6 flex flex-wrap flex-col sm:flex-row">
        <div className="sm:w-[20%] truncate pt-3 sm:text-right">{t("profile.name")}</div>
        <div className="w-[80%] sm:pl-5">
          <Input
            classNameInput="w-full px-3 py-2 border border-gray-200 outline-none text-black text-sm font-normal"
            register={register}
            name="name"
            placeholder={t("profile.name")}
            messageInputError={errors.name?.message}
          />
        </div>
      </div>
      <div className="sm:mt-2 flex flex-wrap flex-col sm:flex-row">
        <div className="sm:w-[20%] truncate pt-3 sm:text-right">{t("profile.phone")}</div>
        <div className="w-[80%] sm:pl-5">
          <Controller
            control={control}
            name="phone"
            render={({ field }) => {
              return (
                <InputNumber
                  className="mb-2"
                  classNameInput="w-full px-3 py-2 border border-gray-200 outline-none text-black text-sm font-normal"
                  classNameError="block mt-1 min-h-[1.25rem] text-red-500 text-sm"
                  placeholder={t("profile.phone")}
                  messageInputError={errors.phone?.message}
                  {...field}
                  onChange={field.onChange}
                />
              )
            }}
          />
        </div>
      </div>
    </Fragment>
  )
}

export default function Profile() {
  const { t } = useTranslation("profile")
  const { darkMode, setIsProfile } = useContext(AppContext)
  const [file, setFile] = useState<File>()

  const previewImage = useMemo(() => {
    return file ? URL.createObjectURL(file) : ""
  }, [file])

  const methods = useForm<FormData1>({
    resolver: yupResolver(profileSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      avatar: "",
      date_of_birth: new Date(1990, 0, 1) // 1/1/1990 -- tháng bắt đầu từ số 0 - tháng 1
    }
  })

  const {
    register,
    control,
    formState: { errors },
    handleSubmit,
    setValue,
    watch,
    setError
  } = methods

  const getProfileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => {
      return userApi.getProfile()
    }
  })

  const profile = getProfileQuery.data?.data.data
  //console.log(profile)

  useEffect(() => {
    if (profile) {
      setValue("name", profile.name) // sau khi fetch data về thì useEffect data ra form = setValue
      setValue("address", profile.address)
      setValue("phone", profile.phone)
      setValue("avatar", profile.avatar)
      setValue(
        "date_of_birth",
        profile.date_of_birth ? new Date(profile.date_of_birth) : new Date()
      )
    }
  }, [profile, setValue])

  const updateProfileMutation = useMutation({
    mutationFn: (body: BodyUpdateProfile) => {
      return userApi.updateProfile(body)
    }
  })

  type formData = FormData
  const uploadAvatarMutation = useMutation({
    mutationFn: (body: formData) => {
      return userApi.uploadAvatar(body)
    }
  })

  // Flow 1:
  // Nhấn upload: upload lên server luôn => server trả về url ảnh
  // Nhấn submit thì gửi url ảnh cộng với data lên server

  // Flow 2:
  // Nhấn upload: không upload lên server
  // Nhấn submit thì tiến hành upload lên server, nếu upload thành công thì tiến hành gọi api updateProfile - sử dụng flow 2 - chạy 2 lần api

  // submit với các hàm mutation dùng mutateAsync - kết hợp try catch - bắt lỗi
  const onSubmit = handleSubmit(async (data) => {
    try {
      let avatarName = avatarWatch
      if (file) {
        const form = new FormData()
        form.append("image", file) // sử dụng để thêm một cặp tên/giá trị vào đối tượng FormData.
        const res = await uploadAvatarMutation.mutateAsync(form)
        avatarName = res.data.data
        setValue("avatar", avatarName) // cập nhật vào form
      }
      const res = await updateProfileMutation.mutateAsync({
        ...data,
        date_of_birth: data.date_of_birth?.toISOString(),
        avatar: avatarName
      })
      getProfileQuery.refetch()
      toast.success(res.data.message)
      setIsProfile(res.data.data)
      setProfileToLs(res.data.data) // update ở profile (api) đồng thời update ở Ls
    } catch (error) {
      console.log(error)
      if (isError422<ErrorResponse<FormDataString>>(error)) {
        const formData = error.response?.data.data
        console.log(formData)
        if (formData?.avatar) {
          setError("avatar", {
            message: formData.avatar,
            type: "server"
          })
        }
      }
    }
  })

  // submit với các hàm mutation dùng mutate (bình thường) - kết hợp then catch - bắt lỗi
  // const onSubmit = handleSubmit((data) => {
  //   console.log(data)
  //   updateProfileMutation.mutate(
  //     {
  //       ...data,
  //       date_of_birth: data.date_of_birth?.toISOString()
  //     },
  //     {
  //       onSuccess: (data) => {
  //         getProfileQuery.refetch()
  //         toast.success(data.data.message)
  //         setIsProfile(data.data.data)
  //       }
  //     }
  //   )
  // })

  const avatarWatch = watch("avatar")

  const handleChange = (file?: File) => {
    setFile(file)
  }

  return (
    <Fragment>
      <Helmet>
        <title>Hồ sơ của tôi</title>
        <meta name="description" content="Hồ sơ của tôi | E-commerce shop" />
      </Helmet>

      <div className="border-b border-b-gray-200 pb-6">
        <h1
          className={`${darkMode ? "text-white" : "text-black"} text-lg font-semibold capitalize`}
        >
          {t("profile.title")}
        </h1>
        <span className="text-sm">{t("profile.desc")}</span>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col-reverse md:flex-row md:items-start">
          <div className="flex-grow mt-6 md:mt-0 pr-12">
            <div className="flex flex-wrap flex-col sm:flex-row">
              <div className="sm:w-[20%] truncate pt-3 sm:text-right">Email</div>
              <div className="w-[80%] sm:pl-5">
                <div className={`pt-3 ${darkMode ? "text-white" : "text-gray-700"}`}>
                  {profile?.email}
                </div>
              </div>
            </div>

            <Info />

            <div className="sm:mt-2 flex flex-wrap flex-col sm:flex-row">
              <div className="sm:w-[20%] truncate pt-3 sm:text-right">{t("profile.address")}</div>
              <div className="w-[80%] sm:pl-5">
                <Input
                  classNameInput="w-full px-3 py-2 border border-gray-200 outline-none text-black text-sm font-normal"
                  register={register}
                  name="address"
                  placeholder={t("profile.address")}
                  messageInputError={errors.address?.message}
                />
              </div>
            </div>

            <Controller
              control={control}
              name="date_of_birth"
              render={({ field }) => {
                return (
                  <DateSelect
                    errorMessage={errors.date_of_birth?.message}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )
              }}
            />

            <div className="sm:mt-2 flex flex-wrap flex-col sm:flex-row">
              <div className="sm:w-[20%] truncate pt-3 sm:text-right"></div>
              <div className="sm:w-[80%] sm:pl-5">
                <Button
                  type="submit"
                  className="mt-0"
                  classInput="px-5 h-9 flex items-center bg-primaryColor text-white text-sm rounded-sm hover:bg-primaryColor/80 duration-200"
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center md:w-72 md:border-l-2 md:border-l-gray-300">
            <div className="flex flex-col items-center">
              <div className="my-5 h-24 w-24">
                <img
                  src={previewImage || getAvatarUrl(avatarWatch as string)}
                  alt="avatar"
                  className="object-cover w-full h-full rounded-full"
                />
              </div>
              <InputFileImage onChange={handleChange} />

              <div className={`${darkMode ? "text-white/80" : "text-gray-500"} mt-3 text-left`}>
                <div>{t("profile.maxMB")}</div>
                <div>{t("profile.maxMB2")}</div>
              </div>
            </div>
          </div>
        </form>
      </FormProvider>
    </Fragment>
  )
}
