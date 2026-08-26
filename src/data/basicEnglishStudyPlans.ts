export type StudyPlanLesson = {
  number: number
  title: string
  objective: string
  activity: string
}

export type BasicEnglishStudyPlan = {
  level: number
  book: 'Basic English'
  totalLessons: number
  lessons: StudyPlanLesson[]
}

export const BASIC_ENGLISH_STUDY_PLANS = {
  1: {
    "level": 1,
    "book": "Basic English",
    "totalLessons": 50,
    "lessons": [
      {
        "number": 1,
        "title": "Nice to Meet You",
        "objective": "Giới thiệu lời chào cơ bản và trao đổi thông tin cá nhân như tên và quốc tịch.",
        "activity": "Giáo viên giới thiệu các lời chào cơ bản và yêu cầu học sinh thực hành với nhau. Học sinh ghép đôi và nhập vai giới thiệu bản thân và trao đổi tên. Giáo viên lắng nghe các cuộc chuyện, sửa lỗi phát âm và khuyến khích học sinh sử dụng cụm từ mới trong các tình huống khác nhau."
      },
      {
        "number": 2,
        "title": "Where Are You From?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về nguồn gốc và quốc tịch.",
        "activity": "Giáo viên giải thích hỏi và trả lời các câu hỏi về nguồn gốc và quốc tịch. Học sinh lần lượt hỏi nhau về nơi xuất xứ của họ, sử dụng bản đồ thế giới hoặc cờ làm công cụ hỗ trợ trực quan. Giáo viên theo dõi các cuộc trò chuyện, đưa ra phản hồi và đặt các câu hỏi bổ sung để củng cố sự hiểu biết."
      },
      {
        "number": 3,
        "title": "Are You a Teacher?",
        "objective": "Học cách hỏi và trả lời các câu hỏi về nghề nghiệp.",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến nghề nghiệp và luyện tập cách đặt câu hỏi với \"Bạn có phải là...?\" Học sinh thực hành bằng cách hỏi nhau về các nghề nghiệp khác nhau, với giáo viên cung cấp ví dụ và hướng dẫn. Giáo viên tạo điều kiện cho một hoạt động nhóm nơi học sinh đoán nghề nghiệp của nhau dựa trên các gợi ý."
      },
      {
        "number": 4,
        "title": "Is This Your Bag?",
        "objective": "Luyện tập sử dụng đại từ sở hữu và quyền sở hữu của vật thể.",
        "activity": "Giáo viên giới thiệu đại từ sở hữu và hướng dẫn cách hỏi về quyền sở hữu. Học sinh thực hành bằng cách xác định các vật thể trong lớp học và hỏi, \"Đây có phải là... của bạn không?\" và quyền sở hữu của các vật thể. Giáo viên sửa các lỗi và khuyến khích học sinh sử dụng đại từ sở hữu trong câu trả lời của họ."
      },
      {
        "number": 5,
        "title": "Is That Your Bike?",
        "objective": "Tiếp tục luyện tập đại từ sở hữu và mở rộng từ vựng liên quan đến phương tiện giao thông.",
        "activity": "Giáo viên mở rộng bài học về đại từ sở hữu và giới thiệu từ vựng liên quan đến phương tiện giao thông. Học sinh tham gia vào một hoạt động nhập vai, nơi họ hỏi và trả lời các câu hỏi về quyền sở hữu xe đạp, ô tô và các phương tiện tiện khác. Giáo viên cung cấp phản hồi và khuyến khích học sinh sử dụng câu đầy đủ trong câu trả lời của mình."
      },
      {
        "number": 6,
        "title": "It's Not a New Car",
        "objective": "Giới thiệu câu phủ định và luyện tập mô tả các vật thể.",
        "activity": "Giáo viên giới thiệu câu phủ định và từ vựng để mô tả các vật thể. Học sinh thực hành mô tả các vật thể khác nhau là mới hay cũ, sử dụng cả dạng khẳng định và phủ định. Giáo viên dẫn dắt một cuộc thảo luận nơi học sinh so sánh và đối chiếu các vật thể khác nhau, củng cố việc sử dụng câu phủ định."
      },
      {
        "number": 7,
        "title": "What's This?",
        "objective": "Học cách hỏi và trả lời các câu hỏi về việc nhận diện các vật thể.",
        "activity": "Giáo viên giới thiệu cấu trúc câu hỏi \"Đây là gì?\" và các vật thể trong lớp học. Học sinh tham gia vào một cuộc săn tìm kho báu quanh lớp học, hỏi và trả lời các câu hỏi về các vật thể mà họ tìm thấy. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh mô tả các vật thể mà họ đã khám phá trong hoạt động."
      },
      {
        "number": 8,
        "title": "These Are My Pets",
        "objective": "Luyện tập các dạng số nhiều và từ vựng liên quan đến động vật.",
        "activity": "Giáo viên giới thiệu các dạng số nhiều và từ vựng liên quan đến động vật. Học sinh chia sẻ hình ảnh hoặc mô tả về thú cưng của mình, luyện tập các cụm từ \"Đây là...\" và \"Đó là...\" Giáo viên dẫn dắt một cuộc thảo luận trong lớp về thú cưng, giúp học sinh sử dụng từ vựng mới trong ngữ cảnh."
      },
      {
        "number": 9,
        "title": "Are Those Gifts?",
        "objective": "Tiếp tục luyện tập các dạng số nhiều và giới thiệu từ vựng liên quan đến quà tặng và lễ hội.",
        "activity": "Giáo viên ôn lại các dạng số nhiều và giới thiệu từ vựng liên quan đến quà tặng và lễ hội. Học sinh tham gia vào một hoạt động nhập vai nơi họ đoạt nội dung của các hộp quà, hỏi \"Đó có phải là...?\" Giáo viên cung cấp phản hồi về độ chính xác và trôi chảy, hướng dẫn học sinh sử dụng câu hoàn chỉnh."
      },
      {
        "number": 10,
        "title": "Review (01-09)",
        "objective": "Ôn tập và củng cố từ vựng và cấu trúc đã học trong các bài 1-9.",
        "activity": "Giáo viên ôn lại các từ vựng và cấu trúc chính từ các bài 1-9. Học sinh tham gia vào một trò chơi đổ vui, nơi họ trả lời các câu hỏi hoặc thực hiện các nhiệm vụ liên quan đến các bài học trước đó. Giáo viên cung cấp thêm thực hành cho bất kỳ lĩnh vực nào mà học sinh gặp khó khăn, đảm bảo sự hiểu biết vững chắc trước khi chuyển sang bài mới."
      },
      {
        "number": 11,
        "title": "What's Your Phone Number?",
        "objective": "Luyện tập hỏi và cho số điện thoại.",
        "activity": "Giáo viên giới thiệu các cụm từ để hỏi và cho số điện thoại. Học sinh thực hành bằng cách trao đổi số điện thoại với các bạn cùng lớp, tập trung vào cách phát âm và sắp xếp số đúng. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh lặp lại và xác minh số điện thoại của nhau."
      },
      {
        "number": 12,
        "title": "How Much Are They?",
        "objective": "Giới thiệu cách hỏi về giá cả và hiểu câu trả lời.",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến mua sắm và cách hỏi về giá cả. Học sinh tham gia vào một hoạt động nhập vai nơi họ mô phỏng việc mua và bán hàng hóa, luyện tập câu hỏi \"Chúng giá bao nhiêu?\" Giáo viên theo dõi các hoạt động nhập vai, cung cấp phản hồi về phát âm và ngữ pháp."
      },
      {
        "number": 13,
        "title": "How Old Are You?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về tuổi tác.",
        "activity": "Giáo viên giới thiệu câu hỏi \"Bạn bao nhiêu tuổi?\" và thực hành với học sinh. Học sinh phòng vấn nhau, hỏi về tuổi tác và trả lời phù hợp. Giáo viên dẫn dắt một hoạt động trong lớp, nơi học sinh tạo ra một dòng thời gian của cuộc sống của họ, chia sẻ các sự kiện quan trọng và độ tuổi của họ trong những thời điểm đó."
      },
      {
        "number": 14,
        "title": "There Is a Clothes Shop",
        "objective": "Học cách mô tả địa điểm và giới thiệu từ vựng liên quan đến mua sắm.",
        "activity": "Giáo viên giới thiệu cấu trúc \"There is/are\" và từ vựng liên quan đến địa điểm và cửa hàng. Học sinh tham gia vào một hoạt động nhóm, nơi họ tạo ra một bản đồ khu mua sắm, ghi nhận các loại cửa hàng khác nhau. Giáo viên hướng dẫn học sinh trong việc hỏi và trả lời các câu hỏi về vị trí trên bản đồ của họ."
      },
      {
        "number": 15,
        "title": "Are There Tomatoes in the Fridge?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về sự diện tích của các vật thể sử dụng \"there is/are.\"",
        "activity": "Giáo viên ôn lại cấu trúc \"There is/are\" và giới thiệu từ vựng liên quan đến thực phẩm. Học sinh làm việc theo cặp để tạo ra danh sách mua sắm, hỏi nhau về những gì có trong tủ lạnh tưởng tượng của họ. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh chia sẻ danh sách của mình và trả lời các câu hỏi về danh sách đó."
      },
      {
        "number": 16,
        "title": "Is There a Fruit Stand?",
        "objective": "Tiếp tục luyện tập \"there is/are\" và giới thiệu từ vựng liên quan đến thực phẩm và chợ.",
        "activity": "Giáo viên tiếp tục với \"There is/are\" và giới thiệu từ vựng đến chợ và các quầy hàng thực phẩm. Học sinh tham gia vào một hoạt động nhập vai, nơi họ hỏi và trả lời các câu hỏi về sự có mặt của các mặt hàng tại chợ. Giáo viên cung cấp phản hồi về cấu trúc câu và khuyến khích sử dụng ngôn ngữ miêu tả."
      },
      {
        "number": 17,
        "title": "Are There English Books?",
        "objective": "Mở rộng việc hỏi và trả lời các đối tượng trong các ngữ cảnh khác nhau.",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến sách và thư viện và thực hành \"There is/are.\" Học sinh làm việc theo cặp để hỏi và trả lời các câu hỏi tương tự về các địa danh hoặc vật thể nổi tiếng trong các ngữ cảnh khác nhau. Giáo viên theo dõi hoạt động, đưa ra đề xuất cải thiện và củng cố việc sử dụng đúng từ vựng."
      },
      {
        "number": 18,
        "title": "My Book Is in My Bag",
        "objective": "Học cách mô tả vị trí của các vật thể.",
        "activity": "Giáo viên giới thiệu các giới từ chỉ nơi chốn (in, on, under) và thực hành với các vật thể phổ biến. Học sinh tham gia vào một trò chơi, nơi họ giấu các vật thể và mô tả vị trí của chúng bằng cách sử dụng từ vựng mới. Giáo viên kiểm tra sự hiểu biết của học sinh chỉ dẫn vị trí của các vật thể giàu hoàn chỉnh."
      },
      {
        "number": 19,
        "title": "Whose Basketball Is It?",
        "objective": "Luyện tập hỏi và trả lời câu hỏi về sự có sẵn của các vật thể sử dụng \"whose.\"",
        "activity": "Giáo viên giới thiệu câu hỏi \"Cái này là của ai?\" và thực hành từ vựng về quyền sở hữu. Học sinh thực hành bằng cách hỏi và trả lời các câu hỏi về quyền sở hữu của các vật thể khác nhau trong lớp học. Giáo viên dẫn dắt một cuộc thảo luận trong lớp, nơi học sinh đoán chủ sở hữu của các bí ẩn dựa trên các mô tả."
      },
      {
        "number": 20,
        "title": "Review (11-19)",
        "objective": "Ôn tập và củng cố từ vựng và cấu trúc đã học trong các bài 11-19.",
        "activity": "Giáo viên ôn lại các từ vựng và cấu trúc chính từ các bài 11-19. Học sinh tham gia vào một hoạt động đố vui nhóm, nơi trả lời các câu hỏi hoặc hoàn thành các nhiệm vụ liên quan đến các bài học trước đó. Giáo viên cung cấp thêm thực hành cho bất kỳ lĩnh vực nào mà học sinh cần thêm sự hỗ trợ, đảm bảo họ sẵn sàng để tiếp tục học."
      },
      {
        "number": 21,
        "title": "What Are You Doing?",
        "objective": "Giới thiệu và luyện tập thì hiện tại tiếp diễn cho các hành động đang diễn ra.",
        "activity": "Giáo viên giới thiệu thì hiện tại tiếp diễn cho các hành động đang xảy ra. Học sinh thực hành bằng cách mô tả các hoạt động hiện tại của mình và hỏi các bạn cùng lớp về hoạt động của họ. Giáo viên cung cấp phản hồi về cách sử dụng thì hiện tại tiếp diễn và khuyến khích sử dụng cấu trúc này trong nhiều bối cảnh khác nhau."
      },
      {
        "number": 22,
        "title": "I'm Playing Basketball",
        "objective": "Tiếp tục luyện tập thì hiện tại tiếp diễn với nhiều động từ hành động hơn.",
        "activity": "Giáo viên tiếp tục với thì hiện tại tiếp diễn, tập trung vào các động từ hành động. Học sinh tham gia vào một hoạt động nhập vai, nơi họ mô tả các hoạt động đang diễn ra trong bối cảnh thể thao. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh mô tả những gì người khác đang làm trong một loạt hình ảnh."
      },
      {
        "number": 23,
        "title": "Are You Making a Sandwich?",
        "objective": "Học cách hỏi và trả lời câu hỏi sử dụng thì hiện tại tiếp diễn.",
        "activity": "Giáo viên giới thiệu dạng câu hỏi của thì hiện tại tiếp diễn. Học sinh làm việc theo cặp để hỏi và trả lời các câu hỏi về những gì họ đang làm hoặc đang dự định làm. Giáo viên dẫn dắt một cuộc thảo luận trong lớp, nơi học sinh chia sẻ các hoạt động của mình và hỏi nhau các câu hỏi tiếp theo."
      },
      {
        "number": 24,
        "title": "I'm Eating Ramen",
        "objective": "Luyện tập sử dụng thì hiện tại tiếp diễn trong ngữ cảnh ăn uống.",
        "activity": "Giáo viên thực hành thì hiện tại tiếp diễn với từ vựng liên quan đến thực phẩm. Học sinh tham gia vào một mô phỏng nấu ăn, mô tả từng bước các hành động của mình. Giáo viên theo dõi hoạt động, sửa các lỗi và khuyến khích việc sử dụng câu đầy đủ."
      },
      {
        "number": 25,
        "title": "What Are You Writing?",
        "objective": "Tiếp tục luyện tập thì hiện tại tiếp diễn, tập trung vào các hành động khác nhau.",
        "activity": "Giáo viên tiếp tục thực hành thì hiện tại tiếp diễn, tập trung vào viết và các hoạt động sáng tạo. Học sinh thực hành bằng cách mô tả những gì họ đang viết hoặc vẽ, dù là trong thời gian thực hay trong các kịch bản tưởng tượng. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh trình bày công việc của mình và giải thích quá trình thực hiện."
      },
      {
        "number": 26,
        "title": "She Is Doing Her Homework",
        "objective": "Luyện tập sử dụng thì hiện tại tiếp diễn ở ngôi thứ ba số ít.",
        "activity": "Giáo viên thực hành thì hiện tại tiếp diễn ở ngôi thứ ba số ít. Học sinh làm việc theo cặp để mô tả những gì người khác đang làm, sử dụng các hình ảnh gợi ý hoặc hoặc các kịch bản. Giáo viên cung cấp phản hồi về độ chính xác và giúp học sinh cải thiện việc sử dụng thì hiện tại tiếp diễn."
      },
      {
        "number": 27,
        "title": "We Are Lying in the Sun",
        "objective": "Luyện tập thì hiện tại tiếp diễn với các chủ ngữ số nhiều.",
        "activity": "Giáo viên giới thiệu thì hiện tại tiếp diễn với các chủ ngữ số nhiều. Học sinh thực hành bằng cách mô tả các hoạt động nhóm, sử dụng hình ảnh hoặc video làm gợi ý. Giáo viên dẫn dắt một cuộc thảo luận trong lớp, nơi học sinh so sánh các hoạt động nhóm khác nhau và kinh nghiệm của họ."
      },
      {
        "number": 28,
        "title": "They Are Putting Up the Tent",
        "objective": "Mở rộng từ vựng liên quan đến các hoạt động ngoài trời và tiếp tục luyện tập thì hiện tại tiếp diễn.",
        "activity": "Giáo viên tiếp tục với thì hiện tại tiếp diễn và giới thiệu từ vựng liên quan đến các hoạt động ngoài trời. Học sinh tham gia vào một hoạt động nhập vai, nơi họ mô tả một chuyến cắm trại, tập trung vào các hành động đang diễn ra. Giáo viên kể lại các hoạt động của mình trong hoạt động nhập vai."
      },
      {
        "number": 29,
        "title": "We Are Buying Some Food and Drinks",
        "objective": "Kết hợp thì hiện tại tiếp diễn với từ vựng liên quan đến mua sắm.",
        "activity": "Giáo viên kết hợp thì hiện tại tiếp diễn với từ vựng liên quan đến mua sắm. Học sinh tham gia vào một mô phỏng mua sắm, nơi họ mô tả những gì họ đang mua. Giáo viên theo dõi hoạt động, cung cấp phản hồi về việc sử dụng đúng thì và từ vựng."
      },
      {
        "number": 30,
        "title": "Review (21-29)",
        "objective": "Ôn tập và củng cố từ vựng và cấu trúc đã học trong các bài 21-29.",
        "activity": "Giáo viên ôn lại thì hiện tại tiếp diễn và từ vựng chính từ các bài 21-29. Học sinh tham gia vào một hoạt động nhập vai hoặc hoạt động nhóm, kết hợp các yếu tố khác nhau từ các bài học trước đó. Giáo viên cung cấp thêm thực hành và củng cố khi cần thiết, đảm bảo học sinh tự tin trong các kỹ năng của mình."
      },
      {
        "number": 31,
        "title": "I Get Up at 9 O'Clock",
        "objective": "Giới thiệu và luyện tập nói về thói quen hàng ngày và cách nói giờ.",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến thói quen hàng ngày và thực hành cách nói giờ. Học sinh chia sẻ lịch trình hàng ngày của mình, tập trung vào các thời điểm họ thực hiện các hoạt động khác nhau. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh mô tả lịch trình của mình và lịch trình của các bạn cùng lớp."
      },
      {
        "number": 32,
        "title": "What Do You Do on Sunday?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về các hoạt động thường ngày và thói quen cuối tuần.",
        "activity": "Giáo viên giới thiệu thì hiện tại đơn cho các hoạt động thường xuyên và thói quen cuối tuần. Học sinh làm việc theo cặp để hỏi và trả lời các câu hỏi về các hoạt động thường xuyên vào Chủ nhật của mình. Giáo viên theo dõi các cuộc trò chuyện, cung cấp phản hồi về cách sử dụng thì và giúp học sinh mở rộng câu trả lời."
      },
      {
        "number": 33,
        "title": "Do You Like Fried Chicken?",
        "objective": "Giới thiệu và luyện tập nói về sở thích và điều không thích.",
        "activity": "Giáo viên giới thiệu từ vựng để bày tỏ sở thích và điều không thích. Học sinh tham gia vào một cuộc khảo sát trong lớp, nơi họ hỏi nhau về sở thích ăn uống của mình, đặc biệt là tập trung vào gà rán. Giáo viên được dẫn dắt một cuộc thảo luận về các sở thích chung và không thích."
      },
      {
        "number": 34,
        "title": "She Comes From China",
        "objective": "Luyện tập sử dụng thì hiện tại đơn cho các hành động thường xuyên và giới thiệu quốc tịch.",
        "activity": "Giáo viên thực hành thì hiện tại đơn và giới thiệu từ vựng liên quan đến quốc tịch. Học sinh thực hành mô tả nơi mọi người đến từ đâu, sử dụng bản đồ hoặc cờ làm công cụ hỗ trợ trực quan. Giáo viên dẫn dắt một hoạt động trong lớp, nơi học sinh trình bày thông tin về các quốc gia khác nhau và người dân của họ."
      },
      {
        "number": 35,
        "title": "She Likes Ramen and Sushi",
        "objective": "Tiếp tục luyện tập nói về sở thích và điều không thích, tập trung vào từ vựng về thực phẩm.",
        "activity": "Giáo viên tiếp tục với từ vựng liên quan đến sở thích ăn uống và thì hiện tại đơn. Học sinh tạo một thực đơn của các món ăn yêu thích của mình và chia sẻ với lớp, giải thích lý do tại sao họ thích mỗi món. Giáo viên dẫn dắt một cuộc thảo luận, nơi học sinh so sánh sở thích ăn uống của mình và học từ vựng mới."
      },
      {
        "number": 36,
        "title": "What Does She Do on the Weekend?",
        "objective": "Luyện tập hỏi và trả lời câu hỏi về các hoạt động cuối tuần.",
        "activity": "Giáo viên thực hành cách đặt câu hỏi trong thì hiện tại đơn. Học sinh phỏng vấn nhau về các hoạt động cuối tuần, tập trung vào việc sử dụng đúng thì và cấu trúc câu. Giáo viên theo dõi các cuộc phỏng vấn, và khuyến khích học sinh đặt các câu hỏi tiếp theo."
      },
      {
        "number": 37,
        "title": "He Comes From Brazil",
        "objective": "Tiếp tục luyện tập thì hiện tại đơn và giới thiệu thêm về quốc tịch.",
        "activity": "Giáo viên tiếp tục với thì hiện tại đơn và giới thiệu thêm về quốc tịch. Học sinh tham gia vào một hoạt động nhập vai, nơi họ mô tả nguồn gốc và nền tảng của các nhân vật khác nhau. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh trình bày về nhân vật của mình và trả lời các câu hỏi về họ."
      },
      {
        "number": 38,
        "title": "How Many Lessons Does She Have?",
        "objective": "Học cách hỏi và trả lời các câu hỏi về số lượng sử dụng thì hiện tại đơn.",
        "activity": "Giáo viên giới thiệu cấu trúc câu hỏi liên quan đến số lượng sử dụng thì hiện tại đơn. Học sinh thực hành hỏi và trả lời các câu hỏi về số lượng các bài học hoặc hoạt động mà họ có mỗi ngày. Giáo viên dẫn dắt một cuộc thảo luận trong lớp, so sánh lịch trình của mình và sử dụng từ vựng mới."
      },
      {
        "number": 39,
        "title": "How Does She Return to Iran?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về phương thức di chuyển.",
        "activity": "Giáo viên thực hành hỏi và trả lời các câu hỏi về phương thức di chuyển sử dụng thì hiện tại đơn. Học sinh tham gia vào một hoạt động nhập vai, nơi họ mô tả cách họ di chuyển đến các địa điểm khác nhau, tập trung vào cấu trúc câu và từ vựng. Giáo viên cung cấp phản hồi giúp học sinh cải thiện câu trả lời của mình."
      },
      {
        "number": 40,
        "title": "Review (31-39)",
        "objective": "Ôn tập và củng cố từ vựng và cấu trúc đã học trong các bài 31-39.",
        "activity": "Giáo viên ôn lại các từ vựng và cấu trúc chính từ các bài 31-39. Học sinh tham gia vào một trò chơi hoặc hoạt động nhóm bao gồm các nội dung của các bài học trước đó. Giáo viên cung cấp thêm thực hành cho bất kỳ lĩnh vực nào mà học sinh cần thêm sự hỗ trợ, đảm bảo họ sẵn sàng để tiếp tục học."
      },
      {
        "number": 41,
        "title": "Are You Hungry?",
        "objective": "Luyện tập hỏi và trả lời các câu hỏi về trạng thái thể chất (ví dụ: đói, khát).",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến trạng thái thể chất (đói, khát, v.v.) và thực hành cách đặt các câu hỏi liên quan. Học sinh tham gia vào một hoạt động nhập vai, nơi họ hỏi nhau về trạng thái thể chất hiện tại của mình và phản hồi một cách phù hợp. Giáo viên kiểm tra sự hiểu biết bằng cách dẫn dắt một cuộc thảo luận về cách thể hiện các trạng thái thể chất khác nhau."
      },
      {
        "number": 42,
        "title": "How's the Weather in Cebu?",
        "objective": "Giới thiệu và luyện tập nói về thời tiết và địa điểm.",
        "activity": "Giáo viên giới thiệu từ vựng về thảo luận về thời tiết và địa điểm. Học sinh tham gia vào một mô phỏng bản tin thời tiết, mô tả thời tiết ở các địa điểm khác nhau trên thế giới. Giáo viên theo dõi hoạt động, cung cấp phản hồi về việc sử dụng từ vựng đến thời tiết và cấu trúc câu."
      },
      {
        "number": 43,
        "title": "Who Does the Chores in Your Family?",
        "objective": "Luyện tập thảo luận về trách nhiệm gia đình sử dụng thì hiện tại đơn.",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến công việc nhà và thực hành cách đặt câu hỏi trong thì hiện tại đơn. Học sinh thảo luận về sự phân chia công việc nhà trong gia đình của mình, hỏi và trả lời các câu hỏi về ai làm gì. Giáo viên dẫn dắt cuộc thảo luận nhóm về tầm quan trọng của việc chia sẻ trách nhiệm gia đình."
      },
      {
        "number": 44,
        "title": "I Like Swimming in the Pool",
        "objective": "Mở rộng từ vựng liên quan đến sở thích và tiếp tục luyện tập nói về điều yêu thích.",
        "activity": "Giáo viên tiếp tục với từ vựng liên quan đến sở thích và thực hành cách bày tỏ sở thích và điều không thích. Học sinh chia sẻ các sở thích của mình, tập trung vào cấu trúc câu và từ vựng đúng. Giáo viên kiểm tra sự hiểu biết của học sinh giải thích tại sao họ thích các hoạt động mà họ đã chọn."
      },
      {
        "number": 45,
        "title": "Can You Play Basketball?",
        "objective": "Giới thiệu và luyện tập hỏi về khả năng sử dụng \"can.\"",
        "activity": "Giáo viên giới thiệu động từ khiếm khuyết \"can\" để hỏi về khả năng. Học sinh thực hành hỏi và trả lời các câu hỏi về các môn thể thao hoặc hoạt động mà họ có thể làm. Giáo viên theo dõi các cuộc trò chuyện, cung cấp phản hồi về việc sử dụng đúng \"can\" và khuyến khích học sinh mở rộng câu trả lời của mình."
      },
      {
        "number": 46,
        "title": "Can You Play the Guitar?",
        "objective": "Tiếp tục luyện tập hỏi về khả năng và giới thiệu từ vựng liên quan đến nhạc cụ.",
        "activity": "Giáo viên tiếp tục với động từ khiếm khuyết \"can\" và giới thiệu từ vựng liên quan đến nhạc cụ. Học sinh tham gia vào một hoạt động nhập vai, nơi họ hỏi và trả lời câu hỏi về việc chơi các nhạc cụ khác nhau. Giáo viên dẫn dắt một cuộc thảo luận trong lớp về tầm quan trọng của âm nhạc và các nhạc cụ mà học sinh có thể chơi."
      },
      {
        "number": 47,
        "title": "Where Can I Park My Car?",
        "objective": "Luyện tập hỏi về sự cho phép và chỉ đường sử dụng \"can.\"",
        "activity": "Giáo viên thực hành việc sử dụng \"can\" để hỏi về sự cho phép và giới thiệu từ vựng liên quan đến chỉ đường. Học sinh làm việc theo cặp để hỏi và trả lời các câu hỏi về nơi họ có thể đỗ xe, ăn uống, hoặc mua sắm trong các kịch bản khác nhau. Giáo viên kiểm tra sự hiểu biết bằng cách học sinh đưa ra chỉ dẫn hoặc hướng dẫn dựa trên các kịch bản đó."
      },
      {
        "number": 48,
        "title": "I Have a Headache",
        "objective": "Giới thiệu và luyện tập nói về tình trạng sức khỏe và thể chất.",
        "activity": "Giáo viên giới thiệu từ vựng để thảo luận về sức khỏe và tình trạng thể chất. Học sinh tham gia vào một hoạt động nhập vai, nơi họ mô tả triệu chứng của mình và hỏi xin lời khuyên hoặc sự giúp đỡ. Giáo viên cung cấp phản hồi về việc sử dụng đúng từ vựng đến sức khỏe và khuyến khích học sinh thể hiện nhu cầu của mình một cách rõ ràng."
      },
      {
        "number": 49,
        "title": "Review (41-48)",
        "objective": "Ôn tập và củng cố từ vựng và cấu trúc đã học trong các bài 41-48.",
        "activity": "Giáo viên ôn lại các từ vựng và cấu trúc chính từ các bài 41-48. Học sinh tham gia vào một hoạt động nhập vai hoặc hoạt động nhóm, kết hợp các yếu tố khác nhau từ các bài học trước đó. Giáo viên cung cấp thêm thực hành và củng cố khi cần thiết, đảm bảo học sinh tự tin trong các kỹ năng của mình."
      },
      {
        "number": 50,
        "title": "Book Review",
        "objective": "Tóm tắt và củng cố tất cả các từ vựng và cấu trúc chính đã học trong suốt khóa học.",
        "activity": "Giáo viên tổ chức một buổi ôn tập bộ khóa học, tập trung vào các từ vựng và cấu trúc quan trọng nhất đã học. Học sinh tham gia vào một hoạt động cuối cùng, nơi họ thể hiện kỹ năng của mình trong một kịch bản thực tế hoặc nhập vai. Giáo viên cung cấp phản hồi, đánh giá tiến độ của học sinh và đưa ra hướng dẫn cho việc tiếp tục thực hành."
      }
    ]
  },
  2: {
    "level": 2,
    "book": "Basic English",
    "totalLessons": 30,
    "lessons": [
      {
        "number": 1,
        "title": "What is her name?",
        "objective": "Giới thiệu cho học sinh các cấu trúc câu cơ bản sử dụng đại từ nghi vấn \"What\" và tính từ sở hữu (My, Your, His, Her) để hỏi và trả lời các câu hỏi về tên.",
        "activity": "Giáo viên giới thiệu câu hỏi \"What is your name?\" và đưa ra mô hình câu trả lời \"My name is Aya.\" Học sinh thực hành theo cặp, hỏi và trả lời bằng tên của mình. Sau đó, giáo viên mở rộng bài học sang câu hỏi \"What is his/her name?\" và học sinh thực hành giới thiệu người khác, tập trung vào việc sử dụng đúng các tính từ sở hữu."
      },
      {
        "number": 2,
        "title": "This is my sister.",
        "objective": "Dạy học sinh cách giới thiệu các thành viên trong gia đình bằng cách sử dụng đại từ chủ ngữ số ít (I, You, He, She) và đại từ chỉ định \"This.\"",
        "activity": "Giáo viên giới thiệu cách nói \"This is my sister\" và \"Who is this?\" bằng cách sử dụng một đoạn hội thoại đơn giản. Học sinh thực hành giới thiệu một thành viên gia đình hoặc bạn bè với bạn cùng lớp sử dụng cấu trúc \"This is...\". Giáo viên cung cấp phản hồi về cách phát âm và đảm bảo rằng học sinh có thể sử dụng đúng đại từ và từ chỉ định \"This\"."
      },
      {
        "number": 3,
        "title": "They are our neighbors.",
        "objective": "Giúp học sinh phân biệt giữa đại từ chủ ngữ và tính từ sở hữu khi thực hành các động từ liên kết (am, is, are).",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại trong đó học sinh học cách hỏi \"Are they your mom and dad?\" và trả lời \"No, they aren't. They are our neighbors.\" Học sinh thực hành theo cặp, đóng vai đoạn hội thoại và thay thế các thành viên gia đình và hàng xóm khác nhau. Giáo viên kiểm tra sự hiểu biết về đại từ chủ ngữ so với tính từ sở hữu."
      },
      {
        "number": 4,
        "title": "This is our laundry room.",
        "objective": "Giới thiệu cho học sinh cách sử dụng đại từ chủ ngữ và đại từ chỉ định (This, That) và hiểu các hình thức câu khẳng định và phủ định.",
        "activity": "Giáo viên sử dụng hình ảnh trong lớp học để minh họa \"This is our laundry room\" và \"That is our restroom,\" và so sánh với các dạng phủ định như \"No, it isn't.\" Học sinh thực hành nhận diện và mô tả các phòng khác nhau trong một ngôi nhà bằng cách sử dụng các cấu trúc này. Giáo viên hướng dẫn học sinh trong một đoạn hội thoại, nơi họ hỏi và trả lời câu hỏi về vị trí trong nhà."
      },
      {
        "number": 5,
        "title": "These are coloring pens.",
        "objective": "Dạy học sinh cách phân biệt giữa đại từ chỉ định số ít và số nhiều và sử dụng mạo từ không xác định ('a' và 'an').",
        "activity": "Giáo viên giới thiệu các vật dụng như \"This is a sharpener\" và \"These are coloring pens,\" nhấn mạnh sự khác biệt giữa các dạng số ít và số nhiều. Học sinh thực hành bằng cách nhận diện các vật dụng trong lớp học và mô tả chúng bằng cách sử dụng \"this/these\" và \"that/those.\" Giáo viên kiểm tra việc sử dụng đúng mạo từ không xác định và từ chỉ định."
      },
      {
        "number": 6,
        "title": "You look tired.",
        "objective": "Giới thiệu các tính từ chỉ cảm xúc và trạng thái từ \"too,\" và thực hành sử dụng các động từ liên kết để mô tả trạng thái.",
        "activity": "Giáo viên bắt đầu với một đoạn hội thoại, trong đó học sinh học cách nói \"You look tired\" và \"I am thirsty.\" Học sinh sau đó thực hành mô tả cảm giác của mình bằng cách sử dụng các tính từ khác như vui vẻ, mệt mỏi hoặc đói. Giáo viên tạo điều kiện cho một buổi hội thoại, nơi học sinh nói với nhau về cảm giác của mình và phản hồi bằng các tính từ và động từ liên kết thích hợp."
      },
      {
        "number": 7,
        "title": "It is small and beautiful.",
        "objective": "Giúp học sinh mô tả các vật thể bằng cách sử dụng các tính từ trái nghĩa và liên từ \"and.\"",
        "activity": "Giáo viên giới thiệu các tính từ trái nghĩa như \"big and small\" và \"fast and slow,\" sử dụng con vật làm ví dụ. Học sinh thực hành mô tả con vật mà họ nhìn thấy trong vườn thú, sử dụng cấu trúc \"The elephant is big and slow.\" Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh mô tả tả vật thể hoặc con vật khác nhau sử dụng các tính từ trái nghĩa."
      },
      {
        "number": 8,
        "title": "She walks the dog every day.",
        "objective": "Dạy học sinh cách đặt câu hỏi và trả lời ngắn với \"Do\" và sử dụng thì hiện tại đơn để mô tả các hoạt động thường ngày.",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại trong đó học sinh hỏi, \"Do you have a pet?\" và trả lời \"No, I don't, but my sister has a dog.\" Học sinh thực hành hỏi nhau về vật nuôi và các hoạt động mà họ thường làm. Giáo viên hướng dẫn học sinh hình thành các câu trả lời chính xác, nhấn mạnh việc sử dụng \"do\" trong câu hỏi và thì hiện tại đơn."
      },
      {
        "number": 9,
        "title": "Where can I find a pet shop around here?",
        "objective": "Giới thiệu cho học sinh từ vựng WH- cụ thể là \"Where,\" và thực hành sử dụng \"There is\" + danh từ + giới từ chỉ vị trí.",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại hỏi, \"Where can I find a pet shop around here?\" và cung cấp câu trả lời là \"There is a pet shop in the city center.\" Học sinh thực hành hỏi và trả lời về vị trí của các địa điểm trong thị trấn của họ. Giáo viên kiểm tra việc sử dụng đúng \"where,\" \"there is,\" và các giới từ như \"in.\""
      },
      {
        "number": 10,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp, từ vựng và cấu trúc câu từ các bài 1-9.",
        "activity": "Giáo viên ôn tập các điểm chính từ các bài học trước thông qua một loạt các hoạt động tương tác như các câu đố hoặc đóng vai. Học sinh tham gia vào các hoạt động yêu cầu họ sử dụng từ vựng và cấu trúc ngữ pháp đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 11,
        "title": "What is your nationality?",
        "objective": "Giới thiệu cho học sinh cách hỏi và trả lời câu hỏi về quốc gia và quốc tịch bằng cách sử dụng giới từ từ \"from.\"",
        "activity": "Giáo viên giới thiệu câu hỏi \"Where are you from?\" và đưa ra mô hình câu trả lời như \"I am from Japan.\" Học sinh thực hành theo cặp, hỏi và trả lời về quốc tịch của nhau bằng cách sử dụng từ vựng được cung cấp. Giáo viên kiểm tra cách phát âm đúng của tên các quốc gia và quốc tịch và khuyến khích học sinh sử dụng câu đầy đủ."
      },
      {
        "number": 12,
        "title": "I live in Tokyo.",
        "objective": "Dạy học sinh cách nói về nơi sống bằng cách sử dụng \"live in\" cho khu vực rộng lớn và \"live at\" cho địa điểm cụ thể.",
        "activity": "Giáo viên giải thích cách nói \"I live in Tokyo\" và \"I live at 821 Green Street Kyobashi, Tokyo.\" Học sinh thực hành mô tả nơi họ sống, tập trung vào sự khác biệt giữa \"in\" và \"at.\" Giáo viên tạo điều kiện cho một cuộc thảo luận, nơi học sinh hỏi và trả lời về nhà cửa của nhau, kiểm tra việc sử dụng đúng các giới từ."
      },
      {
        "number": 13,
        "title": "I get up at 5 o'clock.",
        "objective": "Giới thiệu cho học sinh các động từ hành động phổ biến và giới thiệu từ chỉ thời gian, tập trung vào các thói quen hàng ngày.",
        "activity": "Giáo viên mô tả cách mô tả thói quen hàng ngày bằng cách sử dụng \"I get up at 5 o'clock\" và các cụm từ liên quan khác. Học sinh mô tả thói quen của mình theo cặp, sử dụng từ vựng và giới từ được cung cấp. Giáo viên hướng dẫn học sinh thảo luận về lịch trình hàng ngày của mình, đảm bảo việc sử dụng đúng các biểu thức thời gian và động từ."
      },
      {
        "number": 14,
        "title": "I like watching TV.",
        "objective": "Dạy học sinh cách nói về sở thích sử dụng \"like + verb-ing\" và giới thiệu từ \"with.\"",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại, trong đó học sinh học cách nói \"I like watching TV, reading books, and playing sports.\" Học sinh thực hành mô tả sở thích của mình và hỏi người khác về sở thích của họ, tập trung vào việc sử dụng đúng cấu trúc \"like + verb-ing.\" Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh chia sẻ sở thích của mình với người chỉnh xác."
      },
      {
        "number": 15,
        "title": "We play soccer once a week.",
        "objective": "Giới thiệu cho học sinh trạng từ chỉ tần suất và cách sử dụng chúng để mô tả mức độ thường xuyên của các hoạt động.",
        "activity": "Giáo viên giải thích cách sử dụng các trạng từ như \"once a week\" để mô tả tần suất của các hoạt động. Học sinh thực hành hỏi và trả lời các câu hỏi về tần suất họ làm các hoạt động cụ thể, sử dụng từ vựng được cung cấp, đưa ra sửa chữa và đảm bảo rằng học sinh có thể sử dụng chính xác các trạng từ tần suất."
      },
      {
        "number": 16,
        "title": "How high is Mt. Fuji?",
        "objective": "Dạy học sinh cách hỏi và trả lời câu hỏi về các phép đo, sử dụng \"how\" + tính từ và các câu trả lời cụ thể.",
        "activity": "Giáo viên giới thiệu câu hỏi \"How high is Mt. Fuji?\" và trả lời với \"It's 3,776 meters high.\" Học sinh thực hành hỏi và trả lời câu hỏi tương tự về các địa danh hoặc vật thể nổi tiếng khác, sử dụng từ vựng được cung cấp. Giáo viên hướng dẫn học sinh qua các bài tập yêu cầu họ sử dụng số lượng và đo lường, kiểm tra cấu trúc câu và sự hiểu biết."
      },
      {
        "number": 17,
        "title": "What day is it today?",
        "objective": "Giới thiệu cho học sinh các ngày trong tuần bằng cách sử dụng từ \"on\" để nói về các ngày cụ thể.",
        "activity": "Giáo viên dạy học sinh hỏi \"What day is it today?\" và trả lời với \"Today is Friday.\" Học sinh thực hành hỏi và trả lời các câu hỏi về các ngày trong tuần, bao gồm cả khi các sự kiện cụ thể diễn ra. Giáo viên kiểm tra phát âm và cách sử dụng đúng các ngày và giới từ, đảm bảo rằng học sinh hiểu thứ tự của các ngày."
      },
      {
        "number": 18,
        "title": "When do you play tennis?",
        "objective": "Dạy học sinh cách hỏi và trả lời câu hỏi về thời gian và địa điểm bằng cách sử dụng các giới từ như \"in,\" \"on,\" và \"at.\"",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại, trong đó học sinh học cách hỏi \"When do you play tennis?\" và \"Where do you play?\" Học sinh thực hành hỏi và trả lời các câu hỏi về các hoạt động của mình, tập trung vào việc sử dụng đúng các giới từ. Giáo viên kiểm tra bằng cách yêu cầu học sinh chia sẻ lịch trình của mình và các địa điểm mà họ thực hiện các hoạt động khác nhau."
      },
      {
        "number": 19,
        "title": "Which is the fourth month of the year?",
        "objective": "Giới thiệu cho học sinh các tháng trong năm, số thứ tự, và cách hỏi \"Which\" câu hỏi.",
        "activity": "Giáo viên giới thiệu câu hỏi \"Which is the fourth month of the year?\" và đưa ra mô hình câu trả lời \"It's April.\" Học sinh thực hành xác định các tháng theo thứ tự và sử dụng các số thứ tự để mô tả chúng. Giáo viên hướng dẫn một cuộc thảo luận trong lớp về những gì diễn ra trong các tháng khác nhau, đảm bảo học sinh có thể sử dụng đúng từ vựng và cấu trúc câu."
      },
      {
        "number": 20,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp, từ vựng và cấu trúc câu từ các bài 1-9.",
        "activity": "Giáo viên ôn tập các điểm chính từ các bài học trước thông qua một loạt các hoạt động tương tác như các câu đố hoặc đóng vai. Học sinh tham gia vào các hoạt động yêu cầu họ sử dụng từ vựng và cấu trúc ngữ pháp đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 21,
        "title": "My birthday is on the 15th of June.",
        "objective": "Dạy học sinh cách nói về ngày tháng, sử dụng các cách khác nhau để nói về ngày tháng và các giới từ \"in\" vs \"on.\"",
        "activity": "Giáo viên giới thiệu cách nói \"My birthday is on the 15th of June\" và thảo luận về cách khác nhau để điền đạt ngày tháng. Học sinh thực hành hỏi và trả lời lối về ngày sinh nhật và các ngày quan trọng khác. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh nói về ngày tháng, đảm bảo rằng học sinh có thể nói về ngày tháng một cách chính xác."
      },
      {
        "number": 22,
        "title": "What's the weather like today?",
        "objective": "Giới thiệu cho học sinh mô tả điều kiện thời tiết bằng cách sử dụng động từ khiếm khuyết \"can\" và cấu trúc \"on + a + weather + day.\"",
        "activity": "Giáo viên giới thiệu từ vựng liên quan đến thời tiết phổ biến và hướng dẫn cách hỏi \"What's the weather like today?\" Học sinh thực hành mô tả thời tiết và nói về những hoạt động họ có thể làm trong ngày có thời tiết khác nhau. Giáo viên tạo điều kiện cho một buổi nhập vai, nơi học sinh thảo luận về kế hoạch dựa trên thời tiết, kiểm tra việc sử dụng đúng các động từ khiếm khuyết và giới từ."
      },
      {
        "number": 23,
        "title": "My grandfather's name is Joe.",
        "objective": "Dạy học sinh cách sử dụng dấu nháy đơn để thể hiện sở hữu trong khi giới thiệu từ vựng về gia đình.",
        "activity": "Giáo viên giới thiệu câu \"My grandfather's name is Joe\" và đưa ra các cụm từ sở hữu khác sử dụng dấu nháy đơn. Học sinh thực hành mô tả các thành viên trong gia đình của mình, tập trung vào việc sử dụng đúng các cụm từ sở hữu. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh chia sẻ thông tin về gia đình của mình bằng cách sử dụng các cấu trúc sở hữu."
      },
      {
        "number": 24,
        "title": "I'm a part-time salesclerk.",
        "objective": "Giới thiệu cho học sinh các từ hỏi khác nhau và cách nói về công việc và thời gian làm việc.",
        "activity": "Giáo viên giới thiệu đoạn hội thoại \"What do you do?\" và \"I'm a part-time salesclerk,\" tập trung vào việc sử dụng các từ hỏi khác nhau. Học sinh thực hành hỏi và trả lời các câu hỏi về công việc của mình hoặc công việc tưởng tượng, thảo luận về nơi và thời gian họ làm việc. Giáo viên hướng dẫn một cuộc thảo luận trong lớp về các nghề nghiệp khác nhau, đảm bảo học sinh có thể sử dụng đúng từ vựng và cấu trúc câu."
      },
      {
        "number": 25,
        "title": "I want to buy a gift for her.",
        "objective": "Dạy học sinh cách sử dụng đại từ chủ ngữ, tính từ sở hữu và đại từ tân ngữ trong câu.",
        "activity": "Giáo viên giới thiệu câu \"I want to buy a gift for her\" và đưa ra các mô hình câu khác nhau sử dụng đại từ tân ngữ. Học sinh thực hành tạo ra các câu mà họ mua, gửi, hoặc nhận thứ gì đó cho ai đó khác, sử dụng các đại từ đúng. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh nhập vai các tình huống mua sắm, tập trung vào việc sử dụng đúng các đại từ."
      },
      {
        "number": 26,
        "title": "How often do you go shopping?",
        "objective": "Giới thiệu cho học sinh các trạng từ chỉ tần suất không xác định và xác định để mô tả mức độ thường xuyên của các hoạt động.",
        "activity": "Giáo viên giải thích cách sử dụng các trạng từ như \"sometimes\" và \"often\" để mô tả tần suất của các hoạt động. Học sinh thực hành hỏi và trả lời các câu hỏi về tần suất họ làm các hoạt động khác nhau, sử dụng từ vựng được cung cấp, sử dụng từ vựng và giúp học sinh tạo thành các câu chính xác mô tả thói quen của họ."
      },
      {
        "number": 27,
        "title": "I need some apples.",
        "objective": "Dạy học sinh cách phân biệt giữa danh từ đếm được và không đếm được và cách sử dụng chúng trong câu.",
        "activity": "Giáo viên giới thiệu các danh từ đếm được như \"apples\" và các danh từ không đếm được như \"milk\" và đưa ra mô hình câu \"I need some apples.\" Học sinh thực hành lập danh sách mua sắm và thảo luận về những gì họ cần mua, sử dụng cả danh từ đếm được và không đếm được. Giáo viên hướng dẫn một hoạt động trong lớp, nơi học sinh chia sẻ danh sách của mình và thảo luận về kế hoạch mua sắm, đảm bảo sử dụng đúng danh từ."
      },
      {
        "number": 28,
        "title": "Do you do the laundry?",
        "objective": "Giới thiệu cho học sinh thì hiện tại đơn và cách nói về các công việc nhà bằng cách sử dụng các hình thức câu khẳng định và phủ định.",
        "activity": "Giáo viên giới thiệu một đoạn hội thoại, trong đó học sinh học cách nói \"I clean my room and wash the dishes\" và \"Do you do the laundry?\" Học sinh thực hành thảo luận về công việc nhà của mình, sử dụng cả các dạng khẳng định và phủ định của thì hiện tại đơn. Giáo viên kiểm tra sự hiểu biết bằng cách yêu cầu học sinh mô tả trách nhiệm gia đình của mình và trả lời các câu hỏi về chúng."
      },
      {
        "number": 29,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp, từ vựng và cấu trúc câu từ các bài 1-8.",
        "activity": "Giáo viên ôn lại các điểm chính từ các bài học trước thông qua một loạt các hoạt động tương tác như các câu đố hoặc đóng vai. Học sinh tham gia vào các hoạt động yêu cầu họ sử dụng từ vựng và cấu trúc ngữ pháp đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 30,
        "title": "Book Review",
        "objective": "Ôn tập và củng cố tất cả từ vựng và cấu trúc ngữ pháp chính được đề cập trong sách, với sự tập trung vào việc áp dụng thực tế.",
        "activity": "Giáo viên tạo điều kiện cho một buổi ôn tập toàn bộ khóa học, bao gồm các điểm chính từ đơn vị học 1-3. Học sinh tham gia vào các hoạt động yêu cầu họ áp dụng kiến thức của mình trong các tình huống thực tế hoặc nhập vai. Giáo viên cung cấp phản hồi, đánh giá tiến độ của học sinh, và đưa ra hướng dẫn cho việc tiếp tục thực hành và cải thiện."
      }
    ]
  },
  3: {
    "level": 3,
    "book": "Basic English",
    "totalLessons": 30,
    "lessons": [
      {
        "number": 1,
        "title": "How many eggs do you eat a day?",
        "objective": "Giới thiệu cho học sinh danh từ đếm được và không đếm được, tập trung vào câu hỏi và trả lời các câu hỏi về số lượng bằng \"How many\" và \"How much.\"",
        "activity": "Giáo viên giới thiệu danh từ đếm được và không đếm được, tập trung vào câu hỏi \"How many eggs do you eat a day?\" và \"How much coffee do you drink?\" Học sinh thực hành hỏi nhau các câu hỏi tương tự về thói quen hàng ngày của mình. Giáo viên kiểm tra việc sử dụng đúng \"many\" và \"much,\" và giúp học sinh hiểu cách diễn đạt số lượng."
      },
      {
        "number": 2,
        "title": "Are there any tomatoes in the fridge?",
        "objective": "Dạy học sinh sự khác biệt giữa \"some\" and \"any\" khi nói về sự có sẵn của các vật thể, và cách sử dụng \"a few\" và \"a little\" để mô tả số lượng.",
        "activity": "Giáo viên giới thiệu cách diễn đạt số lượng bằng cách sử dụng \"some\" và \"any,\" cùng với các cấu trúc như \"Are there any tomatoes in the fridge?\" và \"Is there any milk?\" Học sinh thực hành tạo các câu tương tự bằng cách sử dụng các danh từ khác nhau, và nhập vai một cuộc trò chuyện về những gì có sẵn ở nhà. Giáo viên đảm bảo học sinh sử dụng \"a few\" và \"a little\" một cách chính xác."
      },
      {
        "number": 3,
        "title": "Whose sun umbrella is it?",
        "objective": "Giúp học sinh hiểu và sử dụng đại từ sở hữu và danh từ sở hữu đúng cách, và thực hành tạo câu hỏi với \"Whose.\"",
        "activity": "Giáo viên giới thiệu đại từ sở hữu và danh từ sở hữu thông qua câu hỏi \"Whose sun umbrella is it?\" Học sinh thực hành hỏi và trả lời các câu hỏi tương tự bằng cách sử dụng các đồ vật xung quanh lớp học. Giáo viên theo dõi hoạt động, cung cấp phản hồi về cách sử dụng đúng các dạng sở hữu và dấu nháy đơn."
      },
      {
        "number": 4,
        "title": "Do you want coffee or tea?",
        "objective": "Giới thiệu các câu hỏi lựa chọn sử dụng \"or,\" và dạy cách sử dụng đúng các mạo từ (\"a,\" \"an,\" \"the\") trong câu hỏi và câu.",
        "activity": "Giáo viên giới thiệu các câu hỏi lựa chọn sử dụng \"or,\" như \"Do you want coffee or tea?\" Học sinh thực hành đặt món ăn và thức uống trong một tình huống giả lập tại nhà hàng, sử dụng đúng các mạo từ (\"a,\" \"an,\" \"the\"). Giáo viên đảm bảo rằng học sinh hiểu sự khác biệt giữa việc sử dụng các mạo từ và khi nào nên sử dụng không có mạo từ."
      },
      {
        "number": 5,
        "title": "What do you do on Sundays?",
        "objective": "Giới thiệu và luyện tập thì hiện tại đơn cho các thói quen và hoạt động thường ngày, tập trung vào cách sử dụng các từ hỏi như \"Do\" và \"Does.\"",
        "activity": "Giáo viên ôn tập thì hiện tại đơn bằng cách thảo luận về thói quen, sử dụng các câu hỏi như \"What do you do on Sundays?\" Học sinh thực hành hỏi và trả lời các câu hỏi về hoạt động cuối tuần của mình. Giáo viên tạo điều kiện cho một buổi nhập vai, nơi học sinh mời nhau tham gia các hoạt động cuối tuần, kiểm tra việc sử dụng đúng \"Do\" và \"Does.\""
      },
      {
        "number": 6,
        "title": "Is she playing computer games?",
        "objective": "Giới thiệu thì hiện tại tiếp diễn và cách sử dụng nó cho các hành động đang diễn ra, thực hành các quy tắc chính tả cho động từ kết thúc bằng \"-ing.\"",
        "activity": "Giáo viên giới thiệu thì hiện tại tiếp diễn với các hoạt động như \"Is she playing computer games?\" Học sinh thực hành tạo câu về những gì mọi người đang làm hiện tại, sử dụng hình ảnh hỗ trợ. Giáo viên kiểm tra sự hiểu biết của học sinh về các quy tắc chính tả khi thêm \"-ing\" vào động từ."
      },
      {
        "number": 7,
        "title": "He is fixing my bicycle.",
        "objective": "Dạy học sinh mô tả các hành động đang diễn ra và các kế hoạch tương lai sử dụng thì hiện tại tiếp diễn, và giới thiệu từ vựng liên quan đến các hoạt động thường ngày.",
        "activity": "Giáo viên tiếp tục với thì hiện tại tiếp diễn, tập trung vào cách sử dụng thì này cho các kế hoạch trong tương lai gần, ví dụ, \"I'm going to the city center this afternoon.\" Học sinh thực hành mô tả kế hoạch của mình trong tương lai gần và thảo luận về các hoạt động hiện tại trong câu chuyện, cung cấp phản hồi về cấu trúc câu và cách sử dụng động từ."
      },
      {
        "number": 8,
        "title": "Do you like playing volleyball?",
        "objective": "Thực hành sử dụng \"Do you like\" + gerund để hỏi về sở thích, và phân biệt giữa gerund và present participle.",
        "activity": "Giáo viên giới thiệu cấu trúc \"Do you like + verb ~ing?\" để thảo luận về sở thích, ví dụ, \"Do you like playing volleyball?\" Học sinh thực hành nói về môn thể thao và hoạt động yêu thích của mình, phân biệt giữa gerund và present participle. Giáo viên kiểm tra yêu cầu học sinh chia sẻ sở thích của mình với lớp."
      },
      {
        "number": 9,
        "title": "Mrs. Sato cooks food for the family.",
        "objective": "So sánh thì hiện tại đơn với thì hiện tại tiếp diễn, nhấn mạnh khi nào sử dụng mỗi thì trong các ngữ cảnh khác nhau.",
        "activity": "Giáo viên so sánh thì hiện tại đơn với thì hiện tại tiếp diễn, sử dụng các ví dụ như \"Mrs. Sato cooks food for the family\" với \"Mr. Sato is reading the newspaper.\" Học sinh thực hành mô tả thói quen điển hình so với các hành động đang diễn ra ngay bây giờ. Giáo viên hướng dẫn cuộc thảo luận về sự khác biệt giữa các thì này."
      },
      {
        "number": 10,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố từ vựng, ngữ pháp, và cấu trúc câu từ các bài học trước.",
        "activity": "Giáo viên ôn tập các điểm chính từ các bài học trước thông qua các hoạt động tương tác như câu đố và nhập vai. Học sinh tham gia vào các bài tập yêu cầu hộ sử dụng từ vựng và cấu trúc ngữ pháp mà họ đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 11,
        "title": "It's much cooler than mine.",
        "objective": "Giới thiệu các tính từ so sánh thường và không thường, và thực hành tạo các câu so sánh sử dụng \"cooler,\" \"faster,\" và các tính từ tương tự.",
        "activity": "Giáo viên giới thiệu các tính từ so sánh thường và không thường, sử dụng các câu như \"It's much cooler than mine.\" Học sinh thực hành so sánh giữa các vật, người và địa điểm, sử dụng cả tính từ thường và không thường. Giáo viên kiểm tra việc sử dụng câu so sánh của riêng mình."
      },
      {
        "number": 12,
        "title": "He is the tallest in the campus.",
        "objective": "Dạy học sinh cách sử dụng các tính từ superlative để mô tả mức độ cao nhất một đặc điểm, và thực hành tạo câu với tính từ superlative.",
        "activity": "Giáo viên giới thiệu các tính từ ở cấp độ cao nhất (superlative adjectives), với các ví dụ như \"He is the tallest in the campus.\" Học sinh thực hành sử dụng các tính từ superlative để mô tả mức độ cao nhất của đặc điểm trong các ngữ cảnh khác nhau. Giáo viên theo dõi tiến độ của học sinh và cung cấp phản hồi về cách hình thành và cách sử dụng các tính từ superlative một cách chính xác."
      },
      {
        "number": 13,
        "title": "But I think Arabic is more difficult.",
        "objective": "So sánh và đối chiếu việc sử dụng các tính từ so sánh và superlative, và giới thiệu các từ nhấn mạnh để làm nổi bật câu.",
        "activity": "Giáo viên ôn tập sự khác biệt giữa các tính từ so sánh và superlative, và giới thiệu các từ nhấn mạnh (intensifiers) như \"more difficult\" và \"most talented.\" Học sinh thực hành tạo và sử dụng các tính từ so sánh và superlative trong các cuộc chuyện. Giáo viên kiểm tra độ chính xác và giúp học sinh tránh các lỗi phổ biến."
      },
      {
        "number": 14,
        "title": "I sometimes read science fiction at weekends.",
        "objective": "Giới thiệu các trạng từ chỉ tần suất và cách sử dụng chúng để mô tả các hoạt động, tập trung vào vị trí đúng của chúng trong câu.",
        "activity": "Giáo viên giới thiệu các trạng từ chỉ tần suất như \"always,\" \"usually,\" and \"sometimes,\" và thực hành học sinh hành mô tả thói quen của mình và mức độ thường xuyên họ thực hiện các hoạt động. Giáo viên theo dõi quá trình thực hành, đưa ra sửa chữa và đảm bảo rằng học sinh có thể sử dụng chính xác các trạng từ tần suất."
      },
      {
        "number": 15,
        "title": "It's going to rain soon.",
        "objective": "Dạy học sinh cách sử dụng \"be going to\" cho các dự định trong tương lai, và thực hành sử dụng chúng để mô tả tần suất sử dụng \"It's time to\" trong các ngữ cảnh hàng ngày.",
        "activity": "Giáo viên giới thiệu \"be going to\" cho các kế hoạch trong tương lai, với các câu như \"It's going to rain soon.\" Học sinh thực hành nói về các dự định và kế hoạch trong tương lai, sử dụng cụm từ \"It's time to...\" Giáo viên đảm bảo học sinh có thể tạo câu đúng về các sự kiện và hành động trong tương lai."
      },
      {
        "number": 16,
        "title": "What gift are you going to send me?",
        "objective": "Giới thiệu các câu hỏi WH với \"be going to\" cho các dự định trong tương lai, và thực hành tạo câu so sánh sử dụng \"comparative + and + comparative.\"",
        "activity": "Giáo viên giới thiệu các câu hỏi WH với \"be going to,\" như \"What gift are you going to send me?\" Học sinh thực hành hỏi và trả lời câu hỏi về việc sử dụng các cấu trúc so sánh như \"warmer and warmer.\" Giáo viên theo dõi khả năng của học sinh trong việc tạo ra các câu và so sánh chính xác."
      },
      {
        "number": 17,
        "title": "Did you forget to water the plants?",
        "objective": "Dạy học sinh cách tạo và trả lời các câu hỏi yes/no trong thì quá khứ, và thực hành sử dụng \"did\" cho các hành động trong quá khứ.",
        "activity": "Giáo viên ôn tập thì quá khứ đơn với các câu hỏi như \"Did you forget to water the plants?\" Học sinh thực hành tạo và trả lời các câu hỏi yes/no trong thì quá khứ, tập trung vào các động hàng ngày phổ biến. Giáo viên kiểm tra việc sử dụng đúng động từ và đảm bảo học sinh có thể tạo ra các câu phủ định trong quá khứ."
      },
      {
        "number": 18,
        "title": "What did you do in Hawaii?",
        "objective": "Thực hành sử dụng thì quá khứ đơn để mô tả các sự kiện và hành động trong quá khứ, và giới thiệu từ vựng liên quan đến các hoạt động thường ngày.",
        "activity": "Giáo viên giới thiệu thì quá khứ đơn bằng cách thảo luận về một kỷ niệm gần đây với các câu hỏi như \"What did you do in Hawaii?\" Học sinh thực hành kể lại các sự kiện và mô tả trải nghiệm của mình bằng thì quá khứ đơn. Giáo viên thực hành, đưa ra sửa chữa và củng cố việc sử dụng các động từ quá khứ."
      },
      {
        "number": 19,
        "title": "Mr. Sato didn't set the alarm clock.",
        "objective": "Dạy học sinh cách tạo các câu phủ định trong thì quá khứ đơn, và thực hành tạo các câu về các hành động và thói quen trong quá khứ.",
        "activity": "Giáo viên giới thiệu các câu phủ định trong thì quá khứ, sử dụng các ví dụ như \"Mr. Sato didn't set the alarm clock.\" Học sinh thực hành tạo các câu phủ định về thói quen hàng ngày và các hành động trong quá khứ. Giáo viên kiểm tra sự hiểu biết và giúp học sinh hình thành các câu phủ định chính xác trong thì quá khứ."
      },
      {
        "number": 20,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố từ vựng, ngữ pháp, và cấu trúc câu từ các bài học trước.",
        "activity": "Giáo viên ôn tập các điểm chính từ các bài học trước thông qua các hoạt động tương tác như câu đố và nhập vai. Học sinh tham gia vào các bài tập yêu cầu hộ sử dụng từ vựng và cấu trúc ngữ pháp mà họ đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 21,
        "title": "Can you speak multiple languages?",
        "objective": "Giới thiệu động từ khiếm khuyết \"can\" để diễn tả khả năng và yêu cầu, và thực hành tạo các câu hỏi yes/no với \"can.\"",
        "activity": "Giáo viên giới thiệu động từ khiếm khuyết \"can\" để diễn tả khả năng và yêu cầu, sử dụng các ví dụ như \"Can you speak multiple languages?\" Học sinh thực hành tạo các câu hỏi yes/no với \"can\" và thảo luận về khả năng của mình, làm việc với các câu hỏi \"can\" trong các ngữ cảnh khác nhau."
      },
      {
        "number": 22,
        "title": "What other languages can she speak?",
        "objective": "Dạy học sinh cách hỏi và trả lời câu hỏi về khả năng sử dụng \"can,\" và giới thiệu từ vựng về các ngôn ngữ khác nhau.",
        "activity": "Giáo viên giới thiệu các câu hỏi WH với \"can,\" như \"What other languages can she speak?\" và so sánh với \"could\" và \"be able to.\" Học sinh thực hành hỏi và trả lời câu hỏi về khả năng và kỹ năng ngôn ngữ. Giáo viên cung cấp phản hồi về cách sử dụng đúng của từ khiếm khuyết và giúp học sinh cải thiện tạo câu hỏi của mình."
      },
      {
        "number": 23,
        "title": "I always listen to her attentively.",
        "objective": "Thực hành tạo các trạng từ chỉ cách thức từ tính từ, và sử dụng chúng để mô tả cách thực hiện các hành động.",
        "activity": "Giáo viên giới thiệu các trạng từ chỉ cách thức (adverbs of manner), cho thấy cách tạo chúng từ tính từ (ví dụ, \"carefully\" từ \"careful\"). Học sinh thực hành sử dụng các trạng từ để mô tả cách thực hiện các hành động trong tình huống khác nhau. Giáo viên dẫn dắt tạo các câu phản ánh chính xác mức da các hành động được thực hiện."
      },
      {
        "number": 24,
        "title": "Esta skates very carelessly.",
        "objective": "Giới thiệu các trạng từ so sánh và động từ khiếm khuyết \"should\" để đưa ra lời khuyên và khuyến nghị.",
        "activity": "Giáo viên giới thiệu các trạng từ so sánh và động từ khiếm khuyết \"should,\" với các câu như \"She should skate more carefully.\" Học sinh thực hành đưa ra lời khuyên và so sánh các hành động bằng cách sử dụng các trạng từ. Giáo viên theo dõi hoạt động, cung cấp phản hồi về cách sử dụng đúng các trạng từ so sánh và động từ khiếm khuyết."
      },
      {
        "number": 25,
        "title": "Will it rain tomorrow?",
        "objective": "Dạy học sinh cách sử dụng \"will\" để diễn tả các hành động và dự đoán trong tương lai, và thực hành tạo các câu hỏi và câu trả lời với \"will.\"",
        "activity": "Giáo viên giới thiệu thì tương lai với \"will\" cho các dự đoán và kế hoạch, sử dụng các câu hỏi như \"Will it rain tomorrow?\" Học sinh thực hành tạo câu hỏi và câu trả lời với \"will\" và thảo luận về các sự kiện trong tương lai. Giáo viên kiểm tra cấu trúc câu đúng và đảm bảo hiểu cách sử dụng \"will\" cho các dự đoán tương lai."
      },
      {
        "number": 26,
        "title": "We will probably go there on July 12th.",
        "objective": "Giới thiệu \"might\" và các trạng từ chỉ mức độ chắc chắn để thảo luận về các khả năng và xác suất, và thực hành hỏi và trả lời các câu hỏi về các kế hoạch tương lai.",
        "activity": "Giáo viên giới thiệu động từ khiếm khuyết \"might\" và các trạng từ chỉ mức độ chắc chắn, chẳng hạn như \"probably\" và \"maybe.\" Học sinh thực hành thảo luận về các khả năng và xác suất trong tương lai, sử dụng \"might\" để diễn đạt sự không chắc chắn. Giáo viên hướng dẫn học sinh tạo các câu phản ánh chính xác mức độ chắc chắn khác nhau."
      },
      {
        "number": 27,
        "title": "Were you playing games last night?",
        "objective": "Dạy học sinh cách tạo thì quá khứ tiếp diễn và sử dụng nó để mô tả các hành động đang diễn ra trong quá khứ.",
        "activity": "Giáo viên giới thiệu thì quá khứ tiếp diễn với các ví dụ như \"Were you playing games last night?\" Học sinh thực hành mô tả các hành động đang diễn ra trong quá khứ, đối chiếu với các hành động đã hoàn thành. Giáo viên kiểm tra sự hiểu biết và đảm bảo học sinh có thể tạo các câu khẳng định và phủ định chính xác trong thì quá khứ tiếp diễn."
      },
      {
        "number": 28,
        "title": "Esta felt under the weather.",
        "objective": "So sánh thì quá khứ tiếp diễn với thì quá khứ đơn, tập trung vào khi nào sử dụng mỗi thì trong câu.",
        "activity": "Giáo viên so sánh thì quá khứ tiếp diễn với thì quá khứ đơn, tập trung vào khi nào sử dụng mỗi thì (ví dụ, \"Esta was beginning to feel ill when she arrived home.\"). Học sinh thực hành các câu cả hai để mô tả trình tự các hành động. Giáo viên theo dõi quá trình thực hành, cung cấp phản hồi về cấu trúc câu và cách sử dụng thì."
      },
      {
        "number": 29,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố từ vựng, ngữ pháp, và cấu trúc câu từ các bài học trước.",
        "activity": "Giáo viên ôn tập các điểm chính từ các bài học trước thông qua các hoạt động tương tác như câu đố và nhập vai. Học sinh tham gia vào các bài tập yêu cầu hộ sử dụng từ vựng và cấu trúc ngữ pháp mà họ đã học. Giáo viên xác định các lĩnh vực mà học sinh cần thêm thực hành và cung cấp phản hồi có mục tiêu."
      },
      {
        "number": 30,
        "title": "Book Review",
        "objective": "Ôn tập và tóm tắt tất cả các từ vựng và ngữ pháp chính được đề cập trong sách, với sự tập trung vào việc áp dụng thực tế.",
        "activity": "Giáo viên tạo điều kiện cho một buổi ôn tập toàn bộ khóa học, bao gồm tất cả các điểm từ vựng và ngữ pháp chính từ sách. Học sinh tham gia vào các hoạt động yêu cầu họ áp dụng kiến thức của mình trong các tình huống thực tế hoặc nhập vai. Giáo viên cung cấp phản hồi, đánh giá tiến độ của học sinh, và đưa ra hướng dẫn cho việc tiếp tục thực hành và cải thiện."
      }
    ]
  },
  4: {
    "level": 4,
    "book": "Basic English",
    "totalLessons": 40,
    "lessons": [
      {
        "number": 1,
        "title": "I am going to prepare my resume.",
        "objective": "Giới thiệu thì tương lai đơn và tính từ sở hữu cùng đại từ sở hữu.",
        "activity": "Giáo viên giới thiệu thì tương lai đơn \"will\" và cấu trúc \"be going to\" để nói về các kế hoạch tương lai. Học sinh thực hành bằng cách viết lý lịch (resume) và thảo luận về kế hoạch sau khi tốt nghiệp."
      },
      {
        "number": 2,
        "title": "I made my resume last week.",
        "objective": "Luyện tập thì quá khứ đơn với động từ có quy tắc và bất quy tắc.",
        "activity": "Giáo viên giới thiệu thì quá khứ đơn, nhấn mạnh sự khác biệt giữa động từ có quy tắc và bất quy tắc. Học sinh thực hành nói về những việc họ đã làm trong tuần qua, tập trung vào việc sử dụng đúng thì quá khứ đơn."
      },
      {
        "number": 3,
        "title": "I can compose poems and short stories.",
        "objective": "Phát triển khả năng diễn đạt khả năng sử dụng \"can\" và \"be able to.\"",
        "activity": "Giáo viên dạy cách sử dụng \"can\" để diễn tả khả năng hiện tại và \"be able to\" để nói về khả năng ở các thời điểm khác nhau. Học sinh thực hành mô tả những kỹ năng và khả năng của họ."
      },
      {
        "number": 4,
        "title": "She works with the graphic design team.",
        "objective": "Sử dụng thì hiện tại đơn để mô tả thói quen và sự thật chung.",
        "activity": "Giáo viên dạy cách sử dụng thì hiện tại đơn, nhấn mạnh vào các thói quen và hành động lặp đi lặp lại. Học sinh thực hành mô tả công việc và trách nhiệm hàng ngày của họ, chú ý đến phát âm của âm kết thúc -s."
      },
      {
        "number": 5,
        "title": "How long does it take to finish one project?",
        "objective": "Học cách diễn đạt thời gian hoàn thành công việc bằng cách sử dụng các cụm từ chỉ thời gian.",
        "activity": "Giáo viên dạy cách sử dụng \"How long\" để hỏi về độ dài thời gian và \"It takes\" để trả lời. Học sinh thực hành hỏi và trả lời về thời gian cần thiết để hoàn thành một nhiệm vụ."
      },
      {
        "number": 6,
        "title": "Let's sing karaoke on Saturday!",
        "objective": "Đưa ra đề xuất bằng cách sử dụng mệnh lệnh và cấu trúc \"Let's + động từ.\"",
        "activity": "Giáo viên dạy cách sử dụng câu mệnh lệnh và cách đưa ra đề nghị với \"Let's.\" Học sinh thực hành đưa ra và đáp lại các đề nghị về các hoạt động ngoài giờ học."
      },
      {
        "number": 7,
        "title": "My first day starts on the 26th of this month.",
        "objective": "Luyện tập sử dụng thì hiện tại đơn cho các sự kiện đã được lên lịch trong tương lai.",
        "activity": "Giáo viên dạy cách sử dụng thì hiện tại đơn để nói về các kế hoạch trong tương lai. Học sinh thực hành mô tả các kế hoạch cá nhân của họ và cách sử dụng đúng danh từ, động từ, tính từ trong câu."
      },
      {
        "number": 8,
        "title": "I'm planning to book a tour around the city.",
        "objective": "Sử dụng thì hiện tại tiếp diễn để nói về kế hoạch tương lai.",
        "activity": "Giáo viên giới thiệu thì hiện tại tiếp diễn để nói về các kế hoạch tương lai và các hoạt động đang diễn ra. Học sinh thực hành mô tả kế hoạch của họ và chuẩn bị cho các hoạt động sắp tới."
      },
      {
        "number": 9,
        "title": "Bo and Aya's New Journey",
        "objective": "So sánh thì quá khứ đơn và quá khứ tiếp diễn để mô tả các hành động.",
        "activity": "Giáo viên so sánh và đối chiếu giữa thì quá khứ đơn và quá khứ tiếp diễn, tập trung vào việc sử dụng đúng thì trong các tình huống khác nhau. Học sinh thực hành kể lại các sự kiện đã xảy ra và những hành động đang diễn ra tại một thời điểm cụ thể trong quá khứ."
      },
      {
        "number": 10,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp và từ vựng đã học trong Unit 1.",
        "activity": "Giáo viên ôn tập các điểm ngữ pháp và từ vựng chính từ các bài học trước thông qua các hoạt động tương tác như câu đố hoặc đóng vai. Học sinh tham gia vào các hoạt động yêu cầu họ sử dụng các cấu trúc ngữ pháp và từ vựng đã học, giáo viên cung cấp thêm thực hành và phản hồi mục tiêu để củng cố kiến thức trước khi chuyển sang đơn vị học tiếp theo."
      },
      {
        "number": 11,
        "title": "I work carefully to help clients establish their design needs.",
        "objective": "Luyện tập sử dụng trạng từ để bổ nghĩa cho động từ, tính từ và các trạng từ khác.",
        "activity": "Giáo viên dạy cách sử dụng các loại trạng từ khác nhau để bổ sung ý nghĩa cho động từ, tính từ và trạng từ khác. Học sinh thực hành mô tả cách họ thực hiện các nhiệm vụ hàng ngày."
      },
      {
        "number": 12,
        "title": "The first day was overwhelming.",
        "objective": "Học cách sử dụng trạng từ nối để kết nối ý tưởng trong câu phức.",
        "activity": "Giáo viên giới thiệu trạng từ liên kết để nối các ý tưởng trong câu phức. Học sinh thực hành viết và nói các câu phức tạp với trạng từ liên kết như \"however,\" \"therefore.\""
      },
      {
        "number": 13,
        "title": "I will be meeting some VIPs on Monday.",
        "objective": "Sử dụng thì tương lai tiếp diễn để mô tả các hành động đang diễn ra trong tương lai.",
        "activity": "Giáo viên dạy cách sử dụng thì tương lai tiếp diễn để nói về các hành động đang diễn ra trong tương lai. Học sinh thực hành mô tả các kế hoạch chi tiết và các hoạt động sẽ diễn ra trong tương lai."
      },
      {
        "number": 14,
        "title": "My projects are coming along so well.",
        "objective": "Luyện tập các thì tiếp diễn để thảo luận về các hoạt động đang diễn ra và tương lai.",
        "activity": "Giáo viên dạy cách sử dụng các thì tiếp diễn để nói về các hành động đang diễn ra ở hiện tại, quá khứ và tương lai. Học sinh thực hành mô tả các dự án và công việc của họ, tập trung vào việc sử dụng đúng các thì tiếp diễn."
      },
      {
        "number": 15,
        "title": "Have you ever been to Kyoto?",
        "objective": "Giới thiệu thì hiện tại hoàn thành để nói về những trải nghiệm.",
        "activity": "Giáo viên giới thiệu thì hiện tại hoàn thành để nói về những trải nghiệm và kinh nghiệm trong quá khứ. Học sinh thực hành mô tả tã những nơi họ từng đến và những trải nghiệm của họ."
      },
      {
        "number": 16,
        "title": "I have finished the design proposals.",
        "objective": "Sử dụng thì hiện tại hoàn thành để thảo luận về các hành động đã hoàn thành và kết quả của chúng.",
        "activity": "Giáo viên dạy cách sử dụng thì hiện tại hoàn thành để diễn tả kết quả của các hành động trong quá khứ. Học sinh thực hành nói về các nhiệm vụ họ đã hoàn thành và các quyết định họ đã đưa ra."
      },
      {
        "number": 17,
        "title": "I have just finished the meeting with Mr. Tanaka.",
        "objective": "Luyện tập thì hiện tại hoàn thành để mô tả các hành động và tình huống kéo dài.",
        "activity": "Giáo viên dạy cách sử dụng thì hiện tại hoàn thành để nói về các hành động vừa mới xảy ra và các tình huống kéo dài. Học sinh thực hành mô tả các sự kiện vừa xảy ra và những tình huống trong cuộc sống của họ."
      },
      {
        "number": 18,
        "title": "I have been working hard since I got this job.",
        "objective": "So sánh thì hiện tại hoàn thành và thì hiện tại hoàn thành tiếp diễn.",
        "activity": "Giáo viên so sánh giữa thì hiện tại hoàn thành và thì hiện tại hoàn thành tiếp diễn, tập trung vào khi nào sử dụng mỗi thì. Học sinh thực hành mô tả các hoạt động mà họ đã làm trong một khoảng thời gian kéo dài."
      },
      {
        "number": 19,
        "title": "Kyoto is fantastic and one of a kind.",
        "objective": "Học cách sử dụng các tính từ không thể so sánh và so sánh chúng bằng cách sử dụng các mức độ so sánh.",
        "activity": "Giáo viên giới thiệu tính từ không thể so sánh và tính từ có thể so sánh ở các mức độ khác nhau. Học sinh thực hành mô tả các địa điểm và sự kiện, sử dụng tính từ thích hợp để diễn tả mức độ."
      },
      {
        "number": 20,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp và từ vựng đã học trong Unit 2.",
        "activity": "Giáo viên ôn tập các điểm ngữ pháp và từ vựng chính từ các bài học trước thông qua các hoạt động tương tác. Học sinh tham gia vào các hoạt động yêu cầu sử dụng ngữ pháp và từ vựng đã học, giáo viên cung cấp thêm thực hành và phản hồi mục tiêu để củng cố kiến thức trước khi chuyển sang đơn vị học tiếp theo."
      },
      {
        "number": 21,
        "title": "This poster is as eye-catching as that billboard.",
        "objective": "Sử dụng cấu trúc \"as + tính từ/trạng từ + as\" để so sánh.",
        "activity": "Giáo viên dạy cách sử dụng cấu trúc \"as + tính từ + as\" để so sánh sự tương đương và các biểu thức về số lượng như \"half,\" \"twice.\" Học sinh thực hành so sánh các đối tượng và nói về kích thước và số lượng."
      },
      {
        "number": 22,
        "title": "Could you tell me how to get to Miyako Convention?",
        "objective": "Luyện tập cách chỉ đường và hỏi đường sử dụng các cấu trúc ngôn ngữ phù hợp.",
        "activity": "Giáo viên dạy cách hỏi và chỉ đường bằng tiếng Anh, sử dụng từ vựng liên quan đến các địa điểm. Học sinh thực hành hỏi và đưa ra chỉ dẫn cho bạn học của mình."
      },
      {
        "number": 23,
        "title": "Would you like to grab some drinks with me?",
        "objective": "Sử dụng lời mời và giới thiệu từ chỉ nơi chốn và sự di chuyển để hướng dẫn hành động.",
        "activity": "Giáo viên dạy cách sử dụng động từ khiếm khuyết \"would\" để đưa ra lời mời và giới thiệu giới từ chỉ nơi chốn và hướng đi. Học sinh thực hành mời bạn học và chỉ ra vị trí của các địa điểm."
      },
      {
        "number": 24,
        "title": "Brewers do the entire fermentation process.",
        "objective": "So sánh giữa câu chủ động và câu bị động trong cấu trúc câu.",
        "activity": "Giáo viên dạy cách sử dụng câu chủ động và bị động để mô tả các quá trình và sự kiện. Học sinh thực hành mô tả các hoạt động diễn ra trong quá trình sản xuất và các sự kiện lịch sử."
      },
      {
        "number": 25,
        "title": "Let's have a coffee break together, shall we?",
        "objective": "Luyện tập sử dụng câu hỏi đuôi trong hội thoại để xác nhận thông tin.",
        "activity": "Giáo viên dạy cách sử dụng câu hỏi đuôi để xác nhận thông tin và giới thiệu các trường hợp ngoại lệ trong quy tắc sử dụng câu hỏi đuôi. Học sinh thực hành hỏi và trả lời câu hỏi đuôi trong các tình huống khác nhau, kiểm tra sự hiểu biết của họ về các sự kiện và tình huống."
      },
      {
        "number": 26,
        "title": "I think this coffee is best paired with plenty of cookies.",
        "objective": "Khám phá các biểu thức chỉ số lượng với danh từ đếm được và không đếm được.",
        "activity": "Giáo viên ôn tập các biểu thức về số lượng và danh từ tập thể, giúp học sinh phân biệt giữa danh từ đếm được và không đếm được. Học sinh thực hành mô tả các đối tượng và nhóm người, sử dụng các biểu thức số lượng thích hợp."
      },
      {
        "number": 27,
        "title": "I had been busy last week.",
        "objective": "Luyện tập sử dụng thì quá khứ hoàn thành để mô tả các hành động đã hoàn thành trước một hành động quá khứ khác.",
        "activity": "Giáo viên giới thiệu thì quá khứ hoàn thành để nói về các hành động đã hoàn thành trước một thời điểm cụ thể trong quá khứ. Học sinh thực hành mô tả các sự kiện đã xảy ra và các kết quả của chúng trong quá khứ."
      },
      {
        "number": 28,
        "title": "I wish I had worked harder.",
        "objective": "Luyện tập sử dụng thì quá khứ hoàn thành trong lời nói gián tiếp và diễn tả các tình huống giả định.",
        "activity": "Giáo viên dạy cách sử dụng thì quá khứ hoàn thành để báo cáo gián tiếp và diễn tả các sự kiện không thực tế trong quá khứ. Học sinh thực hành kể lại các sự kiện trong quá khứ và bày tỏ những mong muốn hoặc tiếc nuối về những gì họ có thể làm đi."
      },
      {
        "number": 29,
        "title": "Aya had been taking a nap.",
        "objective": "Luyện tập thì quá khứ hoàn thành tiếp diễn để mô tả các hành động đang diễn ra trong quá khứ.",
        "activity": "Giáo viên dạy cách sử dụng thì quá khứ hoàn thành tiếp diễn để mô tả các hành động đang diễn ra trước một sự kiện khác trong quá khứ. Học sinh thực hành mô tả các hoạt động kéo dài trong quá khứ và những gì đã làm trong một khoảng thời gian trước một sự kiện khác."
      },
      {
        "number": 30,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp và từ vựng đã học trong Unit 3.",
        "activity": "Giáo viên ôn tập các điểm ngữ pháp và từ vựng chính từ các bài học trước thông qua các hoạt động tương tác. Học sinh tham gia vào các hoạt động yêu cầu sử dụng các cấu trúc ngữ pháp và từ vựng đã học, giáo viên cung cấp thêm thực hành và phản hồi mục tiêu để củng cố kiến thức trước khi chuyển sang đơn vị học tiếp theo."
      },
      {
        "number": 31,
        "title": "We will have finished it by next month.",
        "objective": "Giới thiệu thì tương lai hoàn thành để thảo luận về các hành động sẽ hoàn thành trước một thời điểm cụ thể.",
        "activity": "Giáo viên giới thiệu thì tương lai hoàn thành để nói về các hành động sẽ được hoàn thành trước một thời điểm cụ thể trong tương lai. Học sinh thực hành mô tả các kế hoạch và mục tiêu họ sẽ đạt được trước một thời điểm trong tương lai."
      },
      {
        "number": 32,
        "title": "We will have been reaching the sales target.",
        "objective": "Luyện tập thì tương lai hoàn thành tiếp diễn để mô tả các hành động đang diễn ra đến một điểm trong tương lai.",
        "activity": "Giáo viên dạy cách sử dụng thì tương lai hoàn thành tiếp diễn để nói về các hành động đang diễn ra trong tương lai trước một thời điểm cụ thể. Học sinh thực hành mô tả các hoạt động mà họ sẽ thực hiện trong một khoảng thời gian kéo dài trước một sự kiện trong tương lai."
      },
      {
        "number": 33,
        "title": "Just prepare diligently and go over all the files.",
        "objective": "Học cách sử dụng động từ chuyển động và không chuyển động cùng động từ cụm trong ngữ cảnh.",
        "activity": "Giáo viên giới thiệu động từ quá khứ và hiện tại, cũng như các động từ phrasal chia tách và không chia tách. Học sinh thực hành sử dụng các động từ phrasal trong các câu có cấu trúc phức tạp."
      },
      {
        "number": 34,
        "title": "We have an array of portable refrigerators here.",
        "objective": "Sử dụng thứ tự và vị trí tính từ để mô tả đối tượng một cách chính xác.",
        "activity": "Giáo viên dạy cách sử dụng tính từ trong câu, bao gồm vị trí và thứ tự của tính từ trong cụm danh từ. Học sinh thực hành mô tả các đối tượng bằng cách sử dụng đúng vị trí và thứ tự của tính từ."
      },
      {
        "number": 35,
        "title": "Our product sales are extremely high this month.",
        "objective": "Luyện tập sử dụng trạng từ tăng cường và giảm cường độ để bổ nghĩa cho tính từ.",
        "activity": "Giáo viên giới thiệu các từ tăng cường và giảm nhẹ, cũng như các thán từ để bày tỏ cảm xúc và cường độ. Học sinh thực hành diễn đạt cảm xúc và ý kiến của họ bằng các từ tăng cường và giảm nhẹ."
      },
      {
        "number": 36,
        "title": "You have got to know your topic well.",
        "objective": "Học cách sử dụng động từ bán khiếm khuyết để đưa ra lời khuyên và luyện tập sử dụng liên từ tương quan.",
        "activity": "Giáo viên giới thiệu cách sử dụng các động từ bán khiếm khuyết để đưa ra lời khuyên và các liên từ tương ứng để kết nối ý tưởng. Học sinh thực hành đưa ra lời khuyên và sử dụng các liên từ tương ứng trong câu."
      },
      {
        "number": 37,
        "title": "My boss Mr. Tanaka has asked me to be his representative.",
        "objective": "Giới thiệu bổ ngữ và luyện tập sử dụng dấu phẩy trong câu.",
        "activity": "Giáo viên dạy cách sử dụng các danh từ định ngữ (appositives) và các quy tắc sử dụng dấu phẩy trong câu. Học sinh thực hành viết và nói các câu có chứa các danh từ định ngữ, đảm bảo sử dụng đúng dấu phẩy."
      },
      {
        "number": 38,
        "title": "In the future, they will see each other often.",
        "objective": "Học cách sử dụng các từ chỉ trình tự và biểu thức nguyên nhân và kết quả trong kể chuyện.",
        "activity": "Giáo viên dạy cách sử dụng từ nối chỉ thứ tự và các biểu thức chỉ nguyên nhân và kết quả để kể lại các sự kiện và mô tả mối quan hệ nguyên nhân-kết quả. Học sinh thực hành kể lại các sự kiện trong cuộc sống của họ, sử dụng từ nối và biểu thức nguyên nhân-kết quả để tạo ra các câu hoàn chỉnh và có ý nghĩa."
      },
      {
        "number": 39,
        "title": "Unit Review",
        "objective": "Ôn tập và củng cố ngữ pháp và từ vựng đã học trong Unit 4.",
        "activity": "Giáo viên ôn tập các điểm ngữ pháp và từ vựng chính từ các bài học trước thông qua các hoạt động tương tác. Học sinh tham gia vào các hoạt động yêu cầu sử dụng các cấu trúc ngữ pháp và từ vựng đã học, giáo viên cung cấp thêm thực hành và phản hồi mục tiêu để củng cố kiến thức trước khi chuyển sang đơn vị học tiếp theo."
      },
      {
        "number": 40,
        "title": "Book Review",
        "objective": "Ôn tập và tóm tắt tất cả các từ vựng và điểm ngữ pháp chính đã học trong sách.",
        "activity": "Giáo viên tổng kết toàn bộ sách thông qua việc ôn tập và thảo luận về những điểm ngữ pháp và từ vựng đã học. Học sinh tham gia vào các hoạt động yêu cầu họ áp dụng kiến thức vào các tình huống thực tế, giáo viên cung cấp phản hồi và hướng dẫn để học sinh tiếp tục cải thiện và phát triển kỹ năng của mình."
      }
    ]
  },
} satisfies Record<number, BasicEnglishStudyPlan>

export function getBasicEnglishStudyPlan(level: number): BasicEnglishStudyPlan | null {
  return BASIC_ENGLISH_STUDY_PLANS[level as keyof typeof BASIC_ENGLISH_STUDY_PLANS] || null
}
